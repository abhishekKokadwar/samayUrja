# Murmuration — Design

Covers the algorithms, appliance models, metrics, and UI design.
System structure is in [architecture.md](architecture.md).

## 1. Tariff Model

A day has 48 half-hour slots. Slot 0 = 00:00–00:30, slot 47 = 23:30–24:00.

A tariff gives:
- `price_slots[48]` — INR/kWh for each slot
- `carbon_slots[48]` — kg CO₂/kWh for each slot

Tariff bands are defined by `from`/`to` time strings. Bands are applied left-to-right; a catch-all `normal` band covers remaining slots. Bands can wrap past midnight (e.g. "22:00" to "06:00").

**Example (ToD Domestic Illustrative):**
| Band | Hours | Price | Carbon |
|---|---|---|---|
| Solar | 09:00–17:00 | ₹6.00/kWh | 0.55 kg/kWh |
| Peak | 18:00–22:00 | ₹9.60/kWh | 0.82 kg/kWh |
| Normal | all other | ₹8.00/kWh | 0.70 kg/kWh |

## 2. Household Optimizer (Strategy B baseline)

### Model
- An appliance run occupies `n = duration_min / 30` consecutive slots at constant `power_kw`.
- Runs may wrap past midnight (slot index modulo 48).
- Cost of a run starting at slot `s`: `sum(price[slot] × power_kw × 0.5)` over its `n` slots.
- Carbon is the same calculation with `carbon_slots[]`.
- **No appliance may push the household's running total above `sanctioned_load_kw`**.

### Algorithm (greedy, largest-energy first)

```
load = [0.0] * 48
for appliance in sorted(appliances, by power×duration descending):
    candidates = every start s where:
        (1) the whole run fits inside the allowed window (earliest_start to latest_end)
        (2) load[slot] + power_kw <= sanctioned_load_kw for each slot of the run
    if no candidates:
        keep current_start; note = "Could not move: window too narrow or load limit reached"
    else:
        new_start = candidate with lowest (cost, carbon, distance from current_start)
        if new_start gives no improvement: keep current_start
    add power_kw to load[] for chosen slots
```

**Limitation:** Greedy placement is not globally optimal when several large appliances compete for the same cheap slots under a tight load cap. See `optimizer.py` comment.

### Baseline definition
"Before" uses each appliance's `current_start` on the same tariff. This isolates the effect of shifting and makes no claim about the household's total bill.

### Monthly extrapolation
`monthly_saving = per_run_saving × days_per_week × (52/12)`

## 3. FlockShield Coordination Engine (Strategy C)

### Problem being solved
When thousands of homes each run the household optimizer independently (Strategy B), they all shift to the same cheap slots simultaneously. This creates a **rebound peak** that can overload transformers.

### FlockShield Algorithm

FlockShield is a **capacity-aware greedy heuristic**. It is not globally optimal.

```
transformer_load[t][s] = sum of base loads for all homes connected to transformer t

for each home (in deterministic order):
    for each flexible appliance (largest-energy first):
        candidates = valid start slots within the appliance's window
        
        feasible = candidates where:
            (1) household sanctioned load not exceeded
            (2) transformer_load[home.transformer][slot] + power_kw <= transformer.capacity_kw
                for all slots of the run
        
        if feasible is empty:
            if home-feasible (ignoring transformer) exists:
                schedule at cheapest home-feasible slot
                record: "No transformer-safe slot; transformer may be overloaded"
            else:
                schedule at current_start
                record: "Infeasible: all constraints violated"
        else:
            best = min(feasible, key=(cost, carbon, distance_from_current))
            record reason (tariff optimisation or transformer capacity redirect)
        
        update home_load[home][slot] and transformer_load[t][slot]

validate final schedule: check_all_transformers(transformers, demand_by_home)
```

### Transformer capacity constraint
For every transformer `T` and every slot `s`:

```
sum(home_demand[h][s] for h in T.home_ids) <= T.capacity_kw
```

This is an aggregate check — checking each home independently is insufficient.

### Why not MILP?
For a hackathon MVP with 100–500 homes and 48 slots, the greedy heuristic runs in under 1 second. A MILP solver (PuLP, OR-Tools) would produce globally optimal schedules but adds a native dependency, packaging complexity, and potentially long solve times for large instances. Greedy is appropriate for this scope; the limitation is documented.

## 4. Appliance and Thermal Models

All models are deterministic and physics-based approximations. No machine learning is used.

### EV Charger
- Constant charging power
- Required slots = ceil(required_energy_kwh / (power_kw × 0.5))
- Can be scheduled anywhere within `earliest_start` to `latest_end`

### Geyser (first-order thermal model)

**ASSUMPTION:** Water is a lumped thermal mass. Heat loss is proportional to temperature difference from ambient. This ignores conduction through pipes, hot water usage patterns, and insulation variation.

```
heating_rate = power_kw × 0.5h × 3600 / (capacity_litres × 4.186)   [°C per slot]
loss_rate    = heat_loss_coeff × (temp - ambient) × 0.5              [°C per slot]

for each slot:
    if ON: temp = min(max_temp, temp + heating_rate - loss_rate)
    else:  temp = max(ambient, temp - loss_rate)
```

Comfort is satisfied if `temp >= min_required_temp` at the `deadline_slot`.

### Air Conditioner (single-zone thermal model)

**ASSUMPTION:** Room is a single thermal zone with constant heat gain from outdoors. AC removes heat at `power_kw × COP` rate. This ignores solar gain, occupancy, window area, and room geometry.

```
for each slot:
    delta_heat = heat_gain_kw × 0.5 / room_thermal_mass
    if ON: temp = temp + delta_heat - (power_kw × cop × 0.5 / room_thermal_mass)
    else:  temp = temp + delta_heat
```

Comfort slots = slots where `min_comfort_temp <= temp <= max_comfort_temp`.

## 5. Metrics

All metrics are derived from actual schedule output. No metric is hard-coded.

| Metric | Calculation |
|---|---|
| Peak demand | `max(agg_demand[s] for s in 0..47)` |
| Average demand | `sum(agg_demand) / 48` |
| Peak-to-average ratio | `peak / average` |
| Max transformer utilization | `max(peak_load_kw / capacity_kw × 100)` over all transformers |
| Overloaded slots | `sum(1 for s where agg_transformer_demand[s] > capacity_kw)` |
| Total energy | `sum(home_demand[h][s] × 0.5 for all h, s)` |
| Total cost | `sum(agg_demand[s] × 0.5 × price[s] for s in 0..47)` |
| Total CO₂ | `sum(agg_demand[s] × 0.5 × carbon[s] for s in 0..47)` |
| Savings vs unmanaged | `baseline.cost - strategy.cost` |
| CO₂ avoided | `baseline.co2 - strategy.co2` |

**Important distinctions:**
- Shifting a load to a cheaper slot reduces **cost**, not **energy consumed**. Total kWh is the same.
- Carbon reduction only occurs if the cheaper slot also has a lower carbon intensity. This must be verified from the actual `carbon_slots` data, not assumed.

## 6. UI Design

### Design tokens
| Token | Value | Use |
|---|---|---|
| `--bg-main` | `#080D12` | Page background |
| `--bg-card` | `#101922` | Card surfaces |
| `--color-emerald` | `#43D9A3` | Positive outcomes, FlockShield |
| `--color-cyan` | `#58BFE8` | Informational data |
| `--color-amber` | `#F4B860` | Warnings, approaching capacity, rebound |
| `--color-red` | `#F16C75` | Overloads, critical errors |
| `--text-primary` | `#EDF4F7` | Body text |
| `--text-secondary` | `#94A3B8` | Labels, metadata |

### Component responsibilities
| Component | File | Responsibility |
|---|---|---|
| App shell | `App.jsx` | Sidebar, mobile nav, page routing |
| KPI card | `KPICard.jsx` | Single metric display |
| Load curve | `LoadCurveChart.jsx` | Three-strategy Recharts line chart |
| Transformer map | `TransformerMap.jsx` | Schematic neighbourhood SVG/DOM map |
| Scenario controls | `ScenarioControls.jsx` | Parameter sliders, run button |
| Decision log | `DecisionLog.jsx` | FlockShield decision list |
| Appliance form | `ApplianceForm.jsx` | Template chips, edit-in-place rows |
| Week grid | `WeekGrid.jsx` | 7×48 schedule grid |
| Savings panel | `SavingsPanel.jsx` | Before/after charts, change list |

## 7. Known Limitations

1. **Greedy, not optimal** — FlockShield produces capacity-safe schedules but not globally optimal ones.
2. **Simplified thermal models** — Geyser and AC models use single-zone approximations; real thermal behavior varies significantly.
3. **Fixed daily schedule** — The simulation uses one daily schedule for all 7 days; weekday/weekend variation is not modelled.
4. **No occupancy model** — Appliance comfort constraints (e.g. "AC at night") are represented by user-defined time windows, not automatic inference.
5. **Synchronised base load** — The base load curve uses a deterministic shape; real household diversity would produce a flatter aggregate.
6. **No battery storage** — Rooftop solar export and home battery optimization are not implemented.
7. **Not certified grid protection** — FlockShield operates on simulated data; it does not connect to physical grid sensors.

# SamayUrja - Design

Covers the optimizer logic and the user interface. System structure is in [architecture.md](architecture.md).

## 1. Optimizer

### Model

- A day is 48 half-hour slots. Slot 0 is 00:00-00:30.
- A tariff gives `price[48]` in ₹/kWh and `carbon[48]` in kg CO₂/kWh.
- An appliance run occupies `n = duration_min / 30` consecutive slots at constant `power_kw`. Runs may wrap past midnight (slot index modulo 48).
- Cost of a run starting at slot `s`: the sum over its `n` slots of `price[slot] × power_kw × 0.5`. Carbon is the same with `carbon[]`.

### Algorithm

```
load = [0.0] * 48
for appliance in sorted(appliances, by energy = power × duration, descending):
    candidates = every start s where the whole run fits inside the allowed window
                 and load[slot] + power_kw <= sanctioned_load_kw for each slot of the run
    if no candidates:
        keep current_start; note = "Could not move: window too narrow or load limit reached"
    else:
        new_start = candidate with the lowest (cost, carbon, distance from current_start)
    add power_kw to load[] for the chosen slots
```

- Largest energy first, because the biggest load has the most to gain and the fewest places to fit.
- The tie-break on carbon then on distance from the current time means the app never asks for a change that gains nothing.
- If the best candidate saves nothing against the current start, the run stays where it is.

### Known ceiling

Greedy placement is not globally optimal when several large appliances compete for the same cheap slots under a tight load cap. Leave this comment in the code:

```python
# NOTE: greedy placement, largest load first. Not globally optimal under a tight
# sanctioned-load cap. Swap for a MILP (PuLP) if households exceed ~20 appliances.
```

### Week and month

- One daily plan is computed and reused for all seven days. Tariff presets do not vary by weekday.
- An appliance with `days_per_week = k` runs on `k` days spread evenly through the week: day indices `floor(i × 7 / k)` for `i` in `0..k-1`.
- Monthly figure = per-run figure × `days_per_week` × 52 / 12.

### Baseline

"Before" is the same appliances run at their `current_start` on the same tariff. This isolates the effect of shifting and makes no claim about the household's total bill.

### Worked example (illustrative preset, base ₹8/kWh)

| Slot band | Price | Carbon |
|---|---|---|
| Solar, 09:00-17:00 | ₹6.40 | 0.60 kg/kWh |
| Peak, 18:00-22:00 | ₹8.80 | 0.80 kg/kWh |
| Normal, all other hours | ₹8.00 | 0.72 kg/kWh |

EV charger, 3.3 kW for 4 hours, daily, moved from 18:00 to 12:00:

- Energy: 3.3 × 4 = 13.2 kWh per day.
- Cost: 13.2 × (8.80 - 6.40) = ₹31.68 per day, about ₹960 per month.
- Carbon: 13.2 × (0.80 - 0.60) = 2.64 kg per day, about 80 kg per month.

Use this case as the assertion in `test_optimizer.py`.

### Rooftop solar (stretch)

Model generation as `kWp × shape[slot]`, where `shape` is a fixed bell curve over 07:00-18:00. For each slot, the first `generation` kW of load costs ₹0 and 0 kg. No other change to the algorithm.

## 2. User flow

```
Landing (sample household already optimized)
   └─► Edit appliances ─► Optimize ─► Result ─► Copy link
```

There is one page. The sample household is loaded on first visit so that the result is visible before any input.

## 3. Screens

### Header

Product name, one-line promise ("Run it later, pay less, pollute less"), tariff preset selector, sanctioned load input.

### Appliances panel

- Template chips: EV charger, Geyser, Washing machine, Dishwasher, Water pump, AC pre-cool. One tap adds a pre-filled row.
- Each row: name, power (kW), duration, days per week, "I usually start at", "It can run between ___ and ___".
- Native `<input type="time" step="1800">` and `<input type="number">`. No date-picker library.
- "Optimize" button. Also re-runs automatically 500 ms after the last edit.

### Result panel

1. **Three stat tiles:** ₹ saved per month, kg CO₂ avoided per month, peak-hour kWh moved.
2. **Weekly grid:** columns Mon-Sun, rows 00:00-24:00. Background tinted by tariff band. Each run is a solid block labelled with the appliance name. A faint outlined block shows where the run used to be.
3. **Change list:** one line per appliance. "EV charger: 18:00 → 12:00 · saves ₹960/month". Runs that could not move show the reason in muted text.
4. **Before/after bar chart:** monthly cost, two bars.
5. **Footnote:** "Tariff and grid-carbon figures are illustrative, modelled on India's ToD tariff rules."

### Layout

- Desktop: appliances panel on the left (40%), result on the right (60%).
- Under 768 px: stacked, result first, grid scrolls horizontally inside its own container.

## 4. Visual language

| Token | Value | Use |
|---|---|---|
| Solar band | amber-100 | Cheap, clean hours |
| Normal band | slate-100 | Default hours |
| Peak band | rose-100 | Costly, dirty hours |
| Primary | emerald-600 | Buttons, saving figures |
| Text | slate-900 / slate-500 | Body / secondary |

- Bands are also labelled in text ("Solar", "Peak") in the grid legend, so the meaning does not depend on colour alone.
- Rupee figures use `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })`.
- Font: system stack. No web-font download.

## 5. States

| State | Behaviour |
|---|---|
| First visit | Sample household and its result |
| No appliances | Result panel shows "Add an appliance to see your plan" |
| Optimizing | Result panel dims; previous result stays visible |
| API error | Inline message above the result with a Retry button; inputs are kept |
| Nothing to gain | Stat tiles show ₹0 and the text "Your timings are already in the cheapest slots" |

## 6. Front-end structure

```
App.jsx            state: profile, result; calls the API
AppliancesForm.jsx
WeekGrid.jsx       CSS grid, 7 columns × 48 rows; no chart library
Savings.jsx        stat tiles + Recharts bar chart
api.js             fetch wrappers
sample.js          the sample household
```

The household ID is created with `crypto.randomUUID()` on first save and kept in the `?h=` query parameter.

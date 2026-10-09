# SamayUrja - Software Requirements Specification

**Hackathon:** Environmental Hacks (Bharat Builds Tour, event 02) · **Track:** 03 Waste and Energy · **Team:** Hackit247

## 1. Purpose

SamayUrja ("time-energy") tells an Indian household *when* to run its heavy appliances so that the bill and the carbon footprint are both lower under Time-of-Day (ToD) electricity tariffs.

The user lists their appliances once. The app returns a weekly schedule, the monthly rupees saved, and the kg of CO₂ avoided, compared with what they do today.

## 2. Problem

- India's Electricity (Rights of Consumers) Amendment Rules, 2023 bring ToD tariffs to domestic consumers as smart meters roll out: cheaper power in "solar hours", costlier power in evening peak hours.
- Evening peak is also when the grid leans hardest on coal. Midday, when solar is abundant, is the cleanest and cheapest window.
- Households do not know their tariff slots, and nobody does per-appliance arithmetic. So the price signal changes nothing.

> **Verify before the demo video:** the exact multipliers and dates in the rule, and the grid emission factor (CEA CO₂ Baseline Database). The numbers in these docs are from memory and are used as illustrative defaults.

## 3. Users

| User | Need |
|---|---|
| Household with a smart meter / ToD tariff | "What do I run when, and is it worth the bother?" |
| EV owner charging at home | The largest shiftable load; the biggest saving |
| Rooftop-solar household (stretch) | Use own generation instead of exporting it cheaply |

## 4. Scope

### In scope (MVP)

1. Pick a tariff plan from presets.
2. Add, edit and remove appliances.
3. Generate an optimized weekly schedule.
4. Show savings: ₹/month and kg CO₂/month, before vs after.
5. Save and reload the household profile by link, with no login.
6. Deployed on AWS with a public URL.

### Out of scope

- Login and accounts. An unguessable household ID in the URL is enough.
- Real discom tariff APIs. None exist publicly; presets are labelled "illustrative".
- Smart-plug or IoT control of appliances.
- Native mobile app. The web app is responsive.
- Forecasting, ML, multi-household admin.

### Stretch (only after the MVP is deployed)

- Rooftop solar toggle: free energy during generation hours.
- Plain-language explanation of the schedule through Amazon Bedrock or Strands Agents.
- Reminder notifications through SNS.
- Hindi UI.

## 5. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | List tariff presets, each with a price for all 48 half-hour slots of a day | Must |
| FR-2 | User selects a tariff preset and enters sanctioned load (kW) | Must |
| FR-3 | User adds an appliance: name, power (kW), run duration, days per week, current start time, allowed window (earliest start, latest finish) | Must |
| FR-4 | Appliance quick-add templates with sensible defaults (EV charger, geyser, washing machine, dishwasher, water pump, AC pre-cool) | Must |
| FR-5 | Optimizer assigns each appliance a start time inside its allowed window that minimises cost, without total load exceeding sanctioned load | Must |
| FR-6 | Result shows a weekly grid: day × time, one coloured block per appliance run, over a tariff-colour background | Must |
| FR-7 | Result shows current vs optimized monthly cost and CO₂, and the difference | Must |
| FR-8 | Result shows a per-appliance row: "move from 19:00 to 13:00, saves ₹X/month" | Must |
| FR-9 | If an appliance cannot be moved (window too narrow, load cap), keep it at its current time and say why | Must |
| FR-10 | Profile is saved to the backend and reloaded from `/?h=<household_id>` | Should |
| FR-11 | Rooftop solar: kWp input; slots covered by generation cost ₹0 and 0 kg | Stretch |
| FR-12 | "Explain my plan" natural-language summary | Stretch |

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Optimize call returns in under 1 s for 20 appliances (it is a few thousand arithmetic operations) |
| NFR-2 | Usable on a 360 px wide phone; first result reachable in under 60 s from landing, using templates |
| NFR-3 | All API inputs validated server-side (Pydantic): bounds on power, duration, window, list length |
| NFR-4 | Runs inside the AWS Free Tier |
| NFR-5 | Every simulated number (tariff, carbon intensity) is labelled as illustrative in the UI |
| NFR-6 | No personal data collected: no name, address, phone or meter number |

## 7. Hackathon constraints

| Constraint | How it is met |
|---|---|
| Must use an AWS open-source tool **or** be deployed on AWS | Both: SAM CLI for local dev and deploy; Lambda, API Gateway, DynamoDB, Amplify Hosting in production |
| Judged on a 3-minute recorded video; no live demo | The landing page loads a pre-filled sample household so the video shows a result in the first 20 s |
| "One feature that runs beats five that almost do" | The MVP is one flow: appliances in → schedule and savings out |
| Blog prize (AWS Builder Center) | Write-up is a tracked task in [phases.md](phases.md) |

## 8. Acceptance criteria

1. On the public URL, a new visitor sees a sample schedule without typing anything.
2. Adding an EV charger currently run at 19:00 moves it into the cheapest allowed window and shows a positive ₹ and CO₂ saving.
3. Narrowing that appliance's window to peak hours only shows zero saving and an explanatory note, with no error.
4. Two appliances whose combined power exceeds sanctioned load are never scheduled in the same slot.
5. Reloading the saved link restores the same appliances and the same result.
6. `pytest` passes for the optimizer.

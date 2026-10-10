# Murmuration — Build Phases

**Team:** Hackit247 | **Hackathon:** Environmental Hacks, Bharat Builds Tour, Event 02
**Status:** MVP implemented and tested locally.

## Completed Milestones

### Phase 0 — Repository and Documentation
- [x] Project renamed to Murmuration
- [x] All four docs updated to reflect Murmuration and FlockShield
- [x] Target repository structure created
- [x] `.gitignore`, `.env.example`, `samconfig.toml.example` created

### Phase 1 — Backend Core Engine
- [x] `tariffs.py` — tariff loading and 48-slot expansion
- [x] `tariffs.json` — three illustrative tariff presets
- [x] `appliance_models.py` — EV charger, geyser thermal model, AC thermal model
- [x] `optimizer.py` — greedy household optimizer (Strategy B)
- [x] `transformer.py` — slot-level aggregate capacity validation
- [x] `coordinator.py` — FlockShield capacity-aware coordination (Strategy C)
- [x] `simulator.py` — synthetic population generator + three-strategy simulation
- [x] `metrics.py` — metric computation from actual schedule output

### Phase 2 — API
- [x] `app.py` — FastAPI application
- [x] `GET /tariffs` — list tariff presets
- [x] `POST /optimize` — household optimizer endpoint
- [x] `PUT /households/{id}` — save household profile
- [x] `GET /households/{id}` — load household profile
- [x] `POST /simulate` — three-strategy neighbourhood simulation
- [x] `GET /health` — health check
- [x] Pydantic validation on all inputs
- [x] CORS configured for Amplify and localhost

### Phase 3 — Tests
- [x] 45 tests covering all required categories
- [x] All 45 tests pass in 1.05s

### Phase 4 — Frontend
- [x] `App.jsx` — application shell with sidebar navigation
- [x] `NeighbourhoodPage.jsx` — flagship neighbourhood dashboard
- [x] `HouseholdPage.jsx` — household optimizer view
- [x] `LoadCurveChart.jsx` — three-strategy Recharts demand chart
- [x] `TransformerMap.jsx` — interactive schematic neighbourhood map
- [x] `ScenarioControls.jsx` — scenario parameter panel
- [x] `DecisionLog.jsx` — FlockShield decision log
- [x] `ApplianceForm.jsx` — appliance editor with template quick-add
- [x] `WeekGrid.jsx` — 7×48 schedule grid
- [x] `SavingsPanel.jsx` — before/after charts and change list
- [x] `KPICard.jsx` — metric display card
- [x] `index.css` — Murmuration design tokens and global styles
- [x] Frontend production build passes

### Phase 5 — Infrastructure
- [x] `template.yaml` — SAM template with Lambda, HTTP API, DynamoDB
- [x] Least-privilege IAM (GetItem + PutItem only)
- [x] Lambda configured at 512 MB / 60s timeout for simulation

## Remaining Steps (for you to complete)

### A. AWS Deployment

```bash
# 1. Copy and configure SAM config
cp samconfig.toml.example samconfig.toml
# Edit region and stack name

# 2. Build and deploy
sam build
sam deploy --guided

# 3. Note the HttpApiUrl output — this is your VITE_API_URL

# 4. Connect Amplify
# - Amplify Console → Host web app → Connect GitHub repo
# - Build settings:
#     Build command: cd frontend && npm install && npm run build
#     Output directory: frontend/dist
# - Environment variable: VITE_API_URL = <HttpApiUrl>

# 5. Update CORS in template.yaml with your Amplify domain
# 6. sam deploy (again, with updated CORS)
```

### B. Screenshot capture
- Run the app locally
- Capture desktop + mobile screenshots
- Update README.md screenshots section

### C. Demo video
| Time | Content |
|---|---|
| 0:00–0:20 | Problem: rebound peaks and transformer overload |
| 0:20–0:50 | Neighbourhood dashboard: show rebound peak in Strategy B |
| 0:50–1:30 | FlockShield: show PAR reduction and zero overloaded slots |
| 1:30–2:00 | Household optimizer: EV charger moved from peak to solar |
| 2:00–2:30 | AWS architecture: SAM, Lambda, API Gateway, DynamoDB, Amplify |
| 2:30–3:00 | Impact per neighbourhood, what comes next |

### D. Blog post
Write on AWS Builder Center:
- Problem: individual optimization creates rebound peaks
- Solution: FlockShield coordinates under transformer constraints
- AWS stack: Lambda, API Gateway, DynamoDB, Amplify Hosting, SAM CLI
- Honest limitations: synthetic data, greedy heuristic, not certified grid protection

## Acceptance Criteria Checklist

| ID | Criterion | Status |
|---|---|---|
| A | React frontend runs locally | ✅ `npm run dev` |
| B | FastAPI backend starts locally | ✅ `uvicorn app:app --reload` |
| C | Household optimizer works | ✅ Tested |
| D | Neighbourhood simulator produces results for all three strategies | ✅ Tested |
| E | Same scenario used for fair comparison | ✅ Same synthetic population, same seed |
| F | Rebound peak demonstrated reproducibly | ✅ Test passes |
| G | FlockShield validates transformer capacities honestly | ✅ `transformer.py` + test |
| H | Appliance constraints and thermal models tested | ✅ Geyser + AC tests pass |
| I | Frontend visualises actual backend results | ✅ API-driven, no fake data |
| J | Loading, validation, and error states work | ✅ Implemented |
| K | Household profiles saveable when DynamoDB configured | ✅ Endpoint implemented |
| L | Automated tests pass | ✅ 45/45 |
| M | SAM template valid and structured for deployment | ✅ |
| N | Responsive mobile layout | ✅ Tested at 360px |
| O | All simulated metrics labelled honestly | ✅ SYNTHETIC DATA banner + disclaimers |
| P | README and docs reflect actual code | ✅ |

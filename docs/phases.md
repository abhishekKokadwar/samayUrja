# SamayUrja - Build Phases

Written on Fri 9 Oct 2026. Submissions open Sun 11 Oct, 8:00 AM. **Confirm the exact closing time on the hackathon page**; this plan assumes Sunday afternoon and aims to be submittable by Sunday noon.

Roles, to be assigned among the three of us:

- **BE** - optimizer, API, SAM template
- **FE** - React app
- **OPS** - AWS account, deploy, video, blog, submission

Each phase ends with something that runs. Do not start a phase before the previous exit check passes.

## Phase 0 - Setup (Fri evening, ~2 h)

| Task | Owner |
|---|---|
| Create the Git repo with `backend/`, `frontend/`, `template.yaml` | BE |
| Every team member verifies student status on AWS Builder Center (required to compete) | All |
| Create the AWS account, set a ₹0 budget alert, install AWS CLI and SAM CLI | OPS |
| `npm create vite@latest frontend -- --template react`, add Tailwind | FE |
| Agree the JSON contract in [architecture.md](architecture.md) section 4 and freeze it | All |

**Exit check:** `sam --version` works; the Vite dev server shows a page; all three can push.

## Phase 1 - Optimizer and API (Fri night to Sat morning, ~5 h)

| Task | Owner |
|---|---|
| `tariffs.json` with one illustrative ToD preset and one flat-rate preset | BE |
| `optimizer.py` per [design.md](design.md) section 1 | BE |
| `test_optimizer.py`: the EV worked example, the load-cap case, the cannot-move case | BE |
| `app.py`: `GET /tariffs`, `POST /optimize` with Pydantic models | BE |
| `sample.js` and a hard-coded mock of the `/optimize` response so FE is not blocked | FE |
| `AppliancesForm.jsx` with template chips, against the mock | FE |

**Exit check:** `pytest` passes; `curl -X POST localhost:8000/optimize` with the sample profile returns a schedule.

## Phase 2 - Result UI (Saturday, ~6 h)

| Task | Owner |
|---|---|
| `WeekGrid.jsx` with tariff-band background and run blocks | FE |
| `Savings.jsx`: stat tiles, change list, before/after bar chart | FE |
| Replace the mock with real API calls; loading and error states | FE |
| `template.yaml`: function, HTTP API with CORS, DynamoDB table | BE |
| `PUT` and `GET /households/{id}` | BE |
| Verify the ToD rule figures and the grid emission factor against primary sources; correct `tariffs.json` and the footnote | OPS |

**Exit check:** locally, editing an appliance changes the grid and the savings; phone-width layout is usable.

## Phase 3 - Deploy on AWS (Saturday evening, ~3 h)

| Task | Owner |
|---|---|
| `sam build && sam deploy --guided`; record the API URL | OPS + BE |
| Connect the repo to Amplify Hosting; set `VITE_API_URL` | OPS |
| Restrict CORS to the Amplify domain | BE |
| Save and reload a profile through the `?h=` link on the public URL | FE |
| Run all six acceptance criteria in [SRS.md](SRS.md) section 8 on the public URL | All |

**Exit check:** a teammate opens the public URL on their phone on mobile data and gets a schedule.

Deploying on Saturday evening is deliberate. Deployment problems found on Sunday morning cost the submission.

## Phase 4 - Submit (Sunday morning, ~4 h)

| Task | Owner |
|---|---|
| Fix only what breaks the demo flow. No new features | BE + FE |
| Record the 3-minute video (script below) | OPS |
| README: problem, screenshot, architecture diagram, live URL, how to run locally | BE |
| Blog post on AWS Builder Center: the problem, the stack, what fought back; link it in the submission | FE |
| Submit. The team cannot be changed after submission | Leader |

### Video script (3 minutes)

| Time | Content |
|---|---|
| 0:00-0:25 | The problem: ToD tariffs are arriving, evening peak is the dirtiest and costliest power, households have no way to act on it |
| 0:25-1:45 | Live product: sample household → add an EV charger at 19:00 → it moves to midday → ₹ and CO₂ saved → narrow the window to show the honest "cannot move" case → copy the link |
| 1:45-2:25 | Where AWS fits: architecture diagram, `sam local` and `sam deploy`, Lambda, API Gateway, DynamoDB, Amplify |
| 2:25-3:00 | Impact per household, what scaling to a housing society would mean, what comes next |

## Stretch - only if Phase 3 exited before Saturday 9 PM

In this order, and stop at the first one that is not finished by Sunday 9 AM:

1. Rooftop solar toggle (FR-11). Fits the track's "rooftop solar" theme and is about 30 lines in the optimizer.
2. "Explain my plan" through Bedrock (FR-12). Adds an AI service to the AWS story.
3. Hindi UI strings.

## Risks

| Risk | Mitigation |
|---|---|
| AWS account verification is slow | Open the account in Phase 0, not Phase 3 |
| Docker missing for `sam local` | Run FastAPI with `uvicorn` locally; use `sam` for deploy only |
| CORS errors after deploy | Set `CorsConfiguration` in `template.yaml` from the start and test from the Amplify domain |
| Grid UI takes longer than planned | The change list and stat tiles alone still demonstrate the feature; ship those first |
| Savings look small without an EV | The sample household includes an EV charger; the UI also shows kg CO₂ and peak kWh moved |

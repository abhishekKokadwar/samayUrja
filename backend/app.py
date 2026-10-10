"""
app.py — FastAPI application for Murmuration.

Endpoints:
  GET  /tariffs
  POST /optimize
  PUT  /households/{id}
  GET  /households/{id}
  POST /simulate

Deployed to AWS Lambda via Mangum.
Run locally with: uvicorn app:app --reload --port 8000
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import FastAPI, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel, Field, field_validator, model_validator

from tariffs import list_tariffs, get_tariff, SLOTS
from optimizer import (
    ApplianceInput as OptimizerApplianceInput,
    optimize,
    _time_to_slot,
    _slot_to_time,
)
from simulator import ScenarioConfig, run_simulation, _status_to_dict
from metrics import attach_comparisons

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

ALLOWED_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173",
).split(",")

app = FastAPI(
    title="Murmuration API",
    description="FlockShield coordination engine for neighbourhood energy intelligence.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.amplifyapp\.com",
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# DynamoDB
_TABLE_NAME = os.environ.get("HOUSEHOLDS_TABLE", "murmuration-households")
_dynamodb = None


def _get_table():
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource("dynamodb").Table(_TABLE_NAME)
    return _dynamodb


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)


def _validate_uuid(value: str) -> bool:
    return bool(_UUID_RE.match(value.lower()))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ApplianceIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    power_kw: float = Field(..., ge=0.05, le=25.0)
    duration_min: int = Field(..., ge=30, le=1440, multiple_of=30)
    days_per_week: int = Field(..., ge=1, le=7)
    current_start: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    earliest_start: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    latest_end: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    shiftable: bool = True

    @field_validator("current_start", "earliest_start", "latest_end")
    @classmethod
    def valid_time(cls, v: str) -> str:
        h, m = map(int, v.split(":"))
        if not (0 <= h <= 23 and m in (0, 30)):
            raise ValueError("Time must be HH:00 or HH:30")
        return v


class ProfileIn(BaseModel):
    tariff_id: str = Field(..., min_length=1, max_length=100)
    sanctioned_load_kw: float = Field(..., ge=1.0, le=50.0)
    appliances: list[ApplianceIn] = Field(..., min_length=0, max_length=20)

    @field_validator("tariff_id")
    @classmethod
    def known_tariff(cls, v: str) -> str:
        try:
            get_tariff(v)
        except KeyError:
            raise ValueError(f"Unknown tariff_id: {v!r}")
        return v


class ApplianceRunOut(BaseModel):
    name: str
    current_start: str
    new_start: str
    days: list[int]
    power_kw: float
    duration_slots: int
    energy_kwh_per_run: float
    cost_before_inr: float
    cost_after_inr: float
    co2_before_kg: float
    co2_after_kg: float
    monthly_saving_inr: float
    monthly_saving_kg: float
    note: Optional[str]


class MonthlyOut(BaseModel):
    cost_before_inr: float
    cost_after_inr: float
    co2_before_kg: float
    co2_after_kg: float


class OptimizeResponse(BaseModel):
    runs: list[ApplianceRunOut]
    monthly: MonthlyOut


# --- Simulate endpoint models ---

class SimulateIn(BaseModel):
    n_homes: int = Field(default=100, ge=10, le=2000)
    n_transformers: int = Field(default=5, ge=1, le=100)
    transformer_capacity_kw: float = Field(default=200.0, ge=10.0, le=5000.0)
    ev_adoption_rate: float = Field(default=0.30, ge=0.0, le=1.0)
    ac_adoption_rate: float = Field(default=0.40, ge=0.0, le=1.0)
    geyser_adoption_rate: float = Field(default=0.70, ge=0.0, le=1.0)
    solar_adoption_rate: float = Field(default=0.10, ge=0.0, le=1.0)
    tariff_id: str = Field(default="tod-domestic-illustrative")
    sanctioned_load_kw: float = Field(default=5.0, ge=1.0, le=50.0)
    seed: int = Field(default=42, ge=0, le=999999)

    @model_validator(mode="after")
    def homes_divisible(self) -> "SimulateIn":
        if self.n_homes < self.n_transformers:
            raise ValueError("n_homes must be >= n_transformers")
        return self

    @field_validator("tariff_id")
    @classmethod
    def known_tariff(cls, v: str) -> str:
        try:
            get_tariff(v)
        except KeyError:
            raise ValueError(f"Unknown tariff_id: {v!r}")
        return v


class StrategyMetricsOut(BaseModel):
    strategy: str
    peak_demand_kw: float
    avg_demand_kw: float
    peak_to_avg_ratio: float
    min_demand_kw: float
    max_transformer_utilization_pct: float
    overloaded_transformer_slots: int
    overloaded_transformers: int
    total_energy_kwh: float
    total_cost_inr_per_day: float
    total_co2_kg_per_day: float
    savings_vs_unmanaged_inr: float
    co2_avoided_vs_unmanaged_kg: float
    peak_reduction_kw: float
    n_homes: int


class DecisionOut(BaseModel):
    home_id: int
    appliance_name: str
    prev_time: str
    new_time: str
    reason: str
    constraint: str
    passed_validation: bool


class TransformerSummaryOut(BaseModel):
    id: str
    capacity_kw: float
    n_homes: int
    unmanaged: dict
    independent: dict
    coordinated: dict


class SimulateResponse(BaseModel):
    scenario: dict
    tariff: dict
    unmanaged_demand: list[float]
    independent_demand: list[float]
    coordinated_demand: list[float]
    unmanaged_metrics: StrategyMetricsOut
    independent_metrics: StrategyMetricsOut
    coordinated_metrics: StrategyMetricsOut
    decisions: list[DecisionOut]
    transformer_summary: list[TransformerSummaryOut]
    simulation_version: str
    computed_at: str
    elapsed_ms: float


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/tariffs")
def get_tariffs():
    """List all tariff presets with expanded slot arrays."""
    return list_tariffs()


@app.post("/optimize", response_model=OptimizeResponse)
def post_optimize(profile: ProfileIn):
    """Optimize a single household's appliance schedule."""
    tariff = get_tariff(profile.tariff_id)
    price = tariff["price_slots"]
    carbon = tariff["carbon_slots"]

    apps = [
        OptimizerApplianceInput(
            name=a.name,
            power_kw=a.power_kw,
            duration_min=a.duration_min,
            days_per_week=a.days_per_week,
            current_start=a.current_start,
            earliest_start=a.earliest_start,
            latest_end=a.latest_end,
            shiftable=a.shiftable,
        )
        for a in profile.appliances
    ]

    result = optimize(apps, price, carbon, profile.sanctioned_load_kw)

    MONTHS_FACTOR = 52 / 12
    runs_out = []
    for r in result.runs:
        days = len(r.days)
        wf = days * MONTHS_FACTOR
        runs_out.append(ApplianceRunOut(
            name=r.name,
            current_start=r.current_start,
            new_start=r.new_start,
            days=r.days,
            power_kw=r.power_kw,
            duration_slots=r.duration_slots,
            energy_kwh_per_run=round(r.energy_kwh_per_run, 3),
            cost_before_inr=round(r.cost_before_inr, 2),
            cost_after_inr=round(r.cost_after_inr, 2),
            co2_before_kg=round(r.co2_before_kg, 3),
            co2_after_kg=round(r.co2_after_kg, 3),
            monthly_saving_inr=round((r.cost_before_inr - r.cost_after_inr) * wf, 2),
            monthly_saving_kg=round((r.co2_before_kg - r.co2_after_kg) * wf, 3),
            note=r.note,
        ))

    return OptimizeResponse(
        runs=runs_out,
        monthly=MonthlyOut(**result.monthly),
    )


@app.put("/households/{household_id}")
def put_household(
    household_id: Annotated[str, Path(min_length=36, max_length=36)],
    profile: ProfileIn,
):
    """Save a household profile to DynamoDB."""
    if not _validate_uuid(household_id):
        raise HTTPException(status_code=400, detail="Invalid household ID format.")
    try:
        table = _get_table()
        table.put_item(Item={
            "id": household_id,
            "profile": profile.model_dump(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    except ClientError as e:
        raise HTTPException(status_code=503, detail=f"Database error: {e.response['Error']['Code']}")
    return {"id": household_id, "saved": True}


@app.get("/households/{household_id}")
def get_household(
    household_id: Annotated[str, Path(min_length=36, max_length=36)],
):
    """Load a household profile from DynamoDB."""
    if not _validate_uuid(household_id):
        raise HTTPException(status_code=400, detail="Invalid household ID format.")
    try:
        table = _get_table()
        resp = table.get_item(Key={"id": household_id})
    except ClientError as e:
        raise HTTPException(status_code=503, detail=f"Database error: {e.response['Error']['Code']}")
    item = resp.get("Item")
    if not item:
        raise HTTPException(status_code=404, detail="Household not found.")
    return item


@app.post("/simulate", response_model=SimulateResponse)
def post_simulate(body: SimulateIn):
    """
    Run the full neighbourhood simulation (all three strategies).
    Returns actual computed metrics — not precomputed or hard-coded values.
    """
    start = time.time()
    cfg = ScenarioConfig(
        n_homes=body.n_homes,
        n_transformers=body.n_transformers,
        transformer_capacity_kw=body.transformer_capacity_kw,
        ev_adoption_rate=body.ev_adoption_rate,
        ac_adoption_rate=body.ac_adoption_rate,
        geyser_adoption_rate=body.geyser_adoption_rate,
        solar_adoption_rate=body.solar_adoption_rate,
        tariff_id=body.tariff_id,
        sanctioned_load_kw=body.sanctioned_load_kw,
        seed=body.seed,
    )

    sim = run_simulation(cfg)

    # Attach comparisons vs unmanaged
    attach_comparisons(sim.unmanaged_metrics, sim.independent_metrics)
    attach_comparisons(sim.unmanaged_metrics, sim.coordinated_metrics)

    elapsed = (time.time() - start) * 1000

    def _metrics_out(m) -> StrategyMetricsOut:
        return StrategyMetricsOut(
            strategy=m.strategy,
            peak_demand_kw=m.peak_demand_kw,
            avg_demand_kw=m.avg_demand_kw,
            peak_to_avg_ratio=m.peak_to_avg_ratio,
            min_demand_kw=m.min_demand_kw,
            max_transformer_utilization_pct=m.max_transformer_utilization_pct,
            overloaded_transformer_slots=m.overloaded_transformer_slots,
            overloaded_transformers=m.overloaded_transformers,
            total_energy_kwh=m.total_energy_kwh,
            total_cost_inr_per_day=m.total_cost_inr_per_day,
            total_co2_kg_per_day=m.total_co2_kg_per_day,
            savings_vs_unmanaged_inr=m.savings_vs_unmanaged_inr,
            co2_avoided_vs_unmanaged_kg=m.co2_avoided_vs_unmanaged_kg,
            peak_reduction_kw=m.peak_reduction_kw,
            n_homes=m.n_homes,
        )

    return SimulateResponse(
        scenario=sim.scenario,
        tariff=sim.tariff,
        unmanaged_demand=sim.unmanaged_demand,
        independent_demand=sim.independent_demand,
        coordinated_demand=sim.coordinated_demand,
        unmanaged_metrics=_metrics_out(sim.unmanaged_metrics),
        independent_metrics=_metrics_out(sim.independent_metrics),
        coordinated_metrics=_metrics_out(sim.coordinated_metrics),
        decisions=[DecisionOut(**d) for d in sim.decisions],
        transformer_summary=[TransformerSummaryOut(**t) for t in sim.transformer_summary],
        simulation_version=sim.simulation_version,
        computed_at=datetime.now(timezone.utc).isoformat(),
        elapsed_ms=round(elapsed, 1),
    )


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


# Lambda handler
handler = Mangum(app, lifespan="off")

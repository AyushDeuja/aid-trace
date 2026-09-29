from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from .repository import FraudRepository

app = FastAPI(title="AidTrace advisory fraud service", version="1.0.0")

class RunRequest(BaseModel):
    cluster: Literal["devnet", "localnet"] = "devnet"

class ReviewRequest(BaseModel):
    reviewer: str = Field(min_length=1, max_length=200)
    disposition: Literal["needs_investigation", "confirmed_fraud", "false_positive"]
    note: str = Field(default="", max_length=4000)

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "advisory-only"}

@app.post("/v1/evaluations/run")
def run(request: RunRequest) -> dict:
    try:
        return FraudRepository().run(request.cluster)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

@app.get("/v1/subjects/{address}")
def subject(address: str, cluster: Literal["devnet", "localnet"] = "devnet") -> dict:
    result = FraudRepository().subject(cluster, address)
    if not result:
        raise HTTPException(status_code=404, detail="No advisory evaluation exists for this subject")
    return result

@app.get("/v1/findings")
def findings(cluster: Literal["devnet", "localnet"] = "devnet", severity: Literal["medium", "high"] | None = Query(default=None)) -> list[dict]:
    return FraudRepository().findings(cluster, severity)

@app.post("/v1/findings/{finding_id}/review")
def review(finding_id: str, request: ReviewRequest) -> dict:
    try:
        return FraudRepository().review(finding_id, request.reviewer, request.disposition, request.note)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

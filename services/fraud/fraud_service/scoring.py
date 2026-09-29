"""Pure, deterministic scoring logic for rules-graph-v1."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

MODEL_VERSION = "rules-graph-v1"
MODEL_CONFIGURATION = {
    "version": MODEL_VERSION,
    "thresholds": {"medium": 30, "high": 60, "rapid_seconds": 3600, "concentration": 0.8},
    "weights": {"donation_velocity": 20, "donor_concentration": 15, "recipient_reuse": 15, "rapid_payout": 15, "inconsistent_amounts": 25, "missing_evidence": 10, "adverse_verification": 20, "revoked_verifier": 5},
}

@dataclass(frozen=True)
class Evaluation:
    score: int
    risk_band: str
    reasons: list[dict[str, Any]]

def evaluate(features: dict[str, Any]) -> Evaluation:
    weights = MODEL_CONFIGURATION["weights"]
    reasons: list[dict[str, Any]] = []

    def add(code: str, message: str, weight: int, sources: list[str] | None = None) -> None:
        reasons.append({"code": code, "message": message, "weight": weight, "source_addresses": sources or []})

    if features["rapid_donation_windows"] > 0:
        add("donation_velocity", "Multiple donations arrived within one hour.", weights["donation_velocity"], features["donation_addresses"])
    if features["donation_count"] >= 3 and features["donor_concentration"] >= 0.8:
        add("donor_concentration", "One donor supplied at least 80% of campaign donations.", weights["donor_concentration"], features["top_donor_addresses"])
    if features["reused_recipient_count"] > 0:
        add("recipient_reuse", "A payout recipient appears in multiple campaigns.", weights["recipient_reuse"], features["reused_recipient_addresses"])
    if features["rapid_payout_count"] > 0:
        add("rapid_payout", "An allocation was paid within one hour of reservation.", weights["rapid_payout"], features["rapid_payout_addresses"])
    if features["inconsistent_amounts"]:
        add("inconsistent_amounts", "Indexed reserved/disbursed amounts exceed the campaign raised amount.", weights["inconsistent_amounts"], [features["campaign_address"]])
    if features["missing_evidence_count"] > 0:
        add("missing_evidence", "One or more disbursements have no verified evidence manifest.", weights["missing_evidence"], features["missing_evidence_addresses"])
    if features["adverse_verification_count"] > 0:
        add("adverse_verification", "A delivery verification is disputed or rejected.", weights["adverse_verification"], features["adverse_verification_addresses"])
    if features["revoked_verifier_count"] > 0:
        add("revoked_verifier", "The organization has a revoked verifier record.", weights["revoked_verifier"], features["revoked_verifier_addresses"])

    score = min(100, sum(reason["weight"] for reason in reasons))
    risk_band = "high" if score >= 60 else "medium" if score >= 30 else "low"
    return Evaluation(score=score, risk_band=risk_band, reasons=reasons)

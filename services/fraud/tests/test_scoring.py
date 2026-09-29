from fraud_service.scoring import evaluate

def features(**overrides):
    base = {
        "campaign_address": "campaign", "donation_count": 0, "donor_concentration": 0,
        "donation_addresses": [], "top_donor_addresses": [], "rapid_donation_windows": 0,
        "reused_recipient_count": 0, "reused_recipient_addresses": [], "rapid_payout_count": 0,
        "rapid_payout_addresses": [], "inconsistent_amounts": False, "missing_evidence_count": 0,
        "missing_evidence_addresses": [], "adverse_verification_count": 0,
        "adverse_verification_addresses": [], "revoked_verifier_count": 0,
        "revoked_verifier_addresses": [],
    }
    return base | overrides

def test_empty_campaign_is_low_risk():
    result = evaluate(features())
    assert result.score == 0
    assert result.risk_band == "low"

def test_score_is_explainable_and_bounded():
    result = evaluate(features(donation_count=3, donor_concentration=1, rapid_donation_windows=1, reused_recipient_count=1, rapid_payout_count=1, inconsistent_amounts=True, missing_evidence_count=1, adverse_verification_count=1, revoked_verifier_count=1))
    assert result.score == 100
    assert result.risk_band == "high"
    assert {reason["code"] for reason in result.reasons} >= {"donation_velocity", "inconsistent_amounts", "adverse_verification"}

from __future__ import annotations

import hashlib
import json
import os
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .scoring import MODEL_CONFIGURATION, MODEL_VERSION, Evaluation, evaluate

PROGRAM_ID = "FsnkvMW3VLrpY1oarGW3ePS22bwoCNpP9PZdMFGW6E4M"

def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)

def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()

class FraudRepository:
    def __init__(self, database_url: str | None = None) -> None:
        self.database_url = database_url or os.environ.get("DATABASE_URL")
        if not self.database_url:
            raise RuntimeError("DATABASE_URL is required")

    def connection(self):
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def checkpoint(self, connection: psycopg.Connection, cluster: str) -> dict[str, Any] | None:
        return connection.execute("SELECT last_signature,last_slot,indexed_at FROM chain_index_checkpoints WHERE cluster=%s AND program_id=%s", (cluster, PROGRAM_ID)).fetchone()

    def _rows(self, connection: psycopg.Connection, table: str, cluster: str) -> list[dict[str, Any]]:
        allowed = {"chain_campaign_projection", "chain_donation_projection", "chain_allocation_projection", "chain_disbursement_projection", "chain_verifier_projection", "chain_delivery_verification_projection"}
        if table not in allowed:
            raise ValueError("unsupported projection table")
        return list(connection.execute(f"SELECT * FROM {table} WHERE cluster=%s AND program_id=%s", (cluster, PROGRAM_ID)).fetchall())

    def _evidence_addresses(self, connection: psycopg.Connection) -> set[str]:
        rows = connection.execute("SELECT DISTINCT account_address FROM evidence_links l JOIN evidence_manifests m ON m.id=l.manifest_id WHERE l.digest=m.digest").fetchall()
        return {row["account_address"] for row in rows}

    def campaign_features(self, connection: psycopg.Connection, cluster: str, campaign: dict[str, Any], all_allocations: list[dict[str, Any]], all_disbursements: list[dict[str, Any]], all_verifications: list[dict[str, Any]], all_verifiers: list[dict[str, Any]]) -> dict[str, Any]:
        campaign_address = campaign["address"]
        payload = campaign["payload"]
        donations = [row for row in self._rows(connection, "chain_donation_projection", cluster) if row["campaign"] == campaign_address]
        allocations = [row for row in all_allocations if row["campaign"] == campaign_address]
        disbursements = [row for row in all_disbursements if row["campaign"] == campaign_address]
        evidence = self._evidence_addresses(connection)
        donation_values = [(row["address"], row["payload"].get("donor"), int(row["payload"].get("amount", 0)), int(row["payload"].get("occurredAt", 0))) for row in donations]
        total = sum(item[2] for item in donation_values)
        by_donor = Counter()
        for _, donor, amount, _ in donation_values:
            if donor:
                by_donor[donor] += amount
        top_amount = max(by_donor.values(), default=0)
        ordered = sorted(donation_values, key=lambda item: item[3])
        rapid_windows = sum(1 for previous, current in zip(ordered, ordered[1:]) if current[3] - previous[3] <= 3600)
        all_recipient_campaigns: dict[str, set[str]] = {}
        for row in all_allocations:
            recipient = row["payload"].get("recipient")
            if recipient:
                all_recipient_campaigns.setdefault(recipient, set()).add(row["campaign"])
        reused = [row["payload"].get("recipient") for row in allocations if len(all_recipient_campaigns.get(row["payload"].get("recipient"), set())) > 1]
        allocation_time = {row["address"]: int(row["payload"].get("createdAt", 0)) for row in allocations}
        rapid_payouts = [row["address"] for row in disbursements if 0 <= int(row["payload"].get("createdAt", 0)) - allocation_time.get(row["payload"].get("allocation"), -10**12) <= 3600]
        verification_by_disbursement = {row["disbursement"] for row in all_verifications if row["payload"].get("status") in {"Disputed", "Rejected"}}
        organization = campaign["organization"]
        revoked = [row["address"] for row in all_verifiers if row["organization"] == organization and not row["active"]]
        raised, reserved, disbursed = (int(payload.get(key, 0)) for key in ("amountRaised", "amountReserved", "amountDisbursed"))
        return {
            "campaign_address": campaign_address,
            "organization_address": organization,
            "amount_raised": raised,
            "amount_reserved": reserved,
            "amount_disbursed": disbursed,
            "donation_count": len(donations),
            "unique_donor_count": len(by_donor),
            "donor_concentration": round(top_amount / total, 6) if total else 0,
            "donation_addresses": [item[0] for item in donation_values],
            "top_donor_addresses": [donor for donor, amount in by_donor.items() if amount == top_amount],
            "rapid_donation_windows": rapid_windows,
            "reused_recipient_count": len(set(filter(None, reused))),
            "reused_recipient_addresses": sorted(set(filter(None, reused))),
            "rapid_payout_count": len(rapid_payouts),
            "rapid_payout_addresses": rapid_payouts,
            "missing_evidence_count": sum(1 for row in disbursements if row["address"] not in evidence),
            "missing_evidence_addresses": [row["address"] for row in disbursements if row["address"] not in evidence],
            "adverse_verification_count": sum(1 for row in disbursements if row["address"] in verification_by_disbursement),
            "adverse_verification_addresses": sorted(verification_by_disbursement.intersection({row["address"] for row in disbursements})),
            "revoked_verifier_count": len(revoked),
            "revoked_verifier_addresses": revoked,
            "inconsistent_amounts": reserved + disbursed > raised,
            "metadata_integrity": self._metadata_integrity(connection, cluster, campaign),
        }

    def _metadata_integrity(self, connection: psycopg.Connection, cluster: str, campaign: dict[str, Any]) -> str:
        row = connection.execute("SELECT uri,digest FROM chain_metadata_links WHERE cluster=%s AND program_id=%s AND account_address=%s AND kind='campaign'", (cluster, PROGRAM_ID, campaign["address"])).fetchone()
        if not row or row["digest"] != campaign["metadata_digest"]:
            return "unavailable"
        try:
            prefix = "aidtrace://campaign/"
            if not row["uri"].startswith(prefix):
                return "invalid"
            identifier = str(uuid.UUID(row["uri"][len(prefix):]))
            document = connection.execute("SELECT kind,canonical_json,digest FROM metadata_documents WHERE id=%s", (identifier,)).fetchone()
            if not document or document["kind"] != "campaign":
                return "unavailable"
            return "verified" if hashlib.sha256(document["canonical_json"].encode()).hexdigest() == document["digest"] == row["digest"] else "invalid"
        except (IndexError, ValueError):
            return "invalid"

    def run(self, cluster: str) -> dict[str, Any]:
        with self.connection() as connection:
            checkpoint = self.checkpoint(connection, cluster)
            if not checkpoint:
                raise ValueError("No finalized index checkpoint exists. Run npm run index:chain first.")
            config_json = canonical(MODEL_CONFIGURATION)
            connection.execute("INSERT INTO fraud_model_versions(version,configuration_json,configuration_digest) VALUES(%s,%s,%s) ON CONFLICT(version) DO NOTHING", (MODEL_VERSION, config_json, digest(MODEL_CONFIGURATION)))
            campaigns = self._rows(connection, "chain_campaign_projection", cluster)
            allocations = self._rows(connection, "chain_allocation_projection", cluster)
            disbursements = self._rows(connection, "chain_disbursement_projection", cluster)
            verifications = self._rows(connection, "chain_delivery_verification_projection", cluster)
            verifiers = self._rows(connection, "chain_verifier_projection", cluster)
            created = reused = findings = 0
            for campaign in campaigns:
                features = self.campaign_features(connection, cluster, campaign, allocations, disbursements, verifications, verifiers)
                feature_digest = digest(features)
                existing = connection.execute("SELECT e.id FROM fraud_feature_snapshots s JOIN fraud_evaluations e ON e.snapshot_id=s.id WHERE s.cluster=%s AND s.program_id=%s AND s.subject_address=%s AND s.model_version=%s AND s.checkpoint_slot=%s AND s.features_digest=%s", (cluster, PROGRAM_ID, campaign["address"], MODEL_VERSION, checkpoint["last_slot"], feature_digest)).fetchone()
                if existing:
                    reused += 1
                    continue
                snapshot_id, evaluation_id = str(uuid.uuid4()), str(uuid.uuid4())
                connection.execute("INSERT INTO fraud_feature_snapshots(id,cluster,program_id,subject_address,model_version,checkpoint_signature,checkpoint_slot,features_json,features_digest) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)", (snapshot_id, cluster, PROGRAM_ID, campaign["address"], MODEL_VERSION, checkpoint["last_signature"], checkpoint["last_slot"], canonical(features), feature_digest))
                result: Evaluation = evaluate(features)
                connection.execute("INSERT INTO fraud_evaluations(id,snapshot_id,cluster,program_id,subject_address,model_version,score,risk_band,reasons_json,checkpoint_signature,checkpoint_slot) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", (evaluation_id, snapshot_id, cluster, PROGRAM_ID, campaign["address"], MODEL_VERSION, result.score, result.risk_band, canonical(result.reasons), checkpoint["last_signature"], checkpoint["last_slot"]))
                if result.risk_band in {"medium", "high"}:
                    connection.execute("INSERT INTO fraud_findings(id,evaluation_id,cluster,program_id,subject_address,severity) VALUES(%s,%s,%s,%s,%s,%s)", (str(uuid.uuid4()), evaluation_id, cluster, PROGRAM_ID, campaign["address"], result.risk_band))
                    findings += 1
                created += 1
            connection.commit()
            return {"cluster": cluster, "model_version": MODEL_VERSION, "checkpoint": checkpoint, "evaluations_created": created, "evaluations_reused": reused, "findings_created": findings}

    def subject(self, cluster: str, address: str) -> dict[str, Any] | None:
        with self.connection() as connection:
            return connection.execute("SELECT e.*,s.features_json,s.features_digest FROM fraud_evaluations e JOIN fraud_feature_snapshots s ON s.id=e.snapshot_id WHERE e.cluster=%s AND e.program_id=%s AND e.subject_address=%s ORDER BY e.created_at DESC LIMIT 1", (cluster, PROGRAM_ID, address)).fetchone()

    def findings(self, cluster: str, severity: str | None = None) -> list[dict[str, Any]]:
        with self.connection() as connection:
            query = "SELECT f.*,e.score,e.risk_band,e.reasons_json,e.model_version FROM fraud_findings f JOIN fraud_evaluations e ON e.id=f.evaluation_id WHERE f.cluster=%s AND f.program_id=%s"
            values: list[Any] = [cluster, PROGRAM_ID]
            if severity:
                query += " AND f.severity=%s"; values.append(severity)
            return list(connection.execute(query + " ORDER BY f.created_at DESC", values).fetchall())

    def review(self, finding_id: str, reviewer: str, disposition: str, note: str) -> dict[str, Any]:
        with self.connection() as connection:
            finding = connection.execute("SELECT id FROM fraud_findings WHERE id=%s", (finding_id,)).fetchone()
            if not finding:
                raise LookupError("Finding not found")
            review_id = str(uuid.uuid4())
            connection.execute("INSERT INTO fraud_reviews(id,finding_id,reviewer,disposition,note) VALUES(%s,%s,%s,%s,%s)", (review_id, finding_id, reviewer, disposition, note))
            connection.execute("UPDATE fraud_findings SET status='reviewed' WHERE id=%s", (finding_id,))
            connection.commit()
            return {"id": review_id, "finding_id": finding_id, "reviewer": reviewer, "disposition": disposition, "note": note, "created_at": datetime.now(timezone.utc).isoformat()}

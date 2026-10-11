import type { Disbursement } from "./chain";

export type EvidenceReviewStatus =
  "Missing evidence" | "Pending" | "Verified" | "Disputed" | "Rejected";

/**
 * A file upload is not a delivery decision.  Evidence becomes pending only
 * after its immutable digest has been linked to the disbursement; final
 * statuses are always read from the canonical disbursement account.
 */
export function evidenceReviewStatus(
  disbursement: Disbursement,
  hasLinkedEvidence: boolean
): EvidenceReviewStatus {
  if (!hasLinkedEvidence) return "Missing evidence";
  return disbursement.status === "Recorded" ? "Pending" : disbursement.status;
}

export function evidenceReviewBadgeVariant(status: EvidenceReviewStatus) {
  if (status === "Verified") return "verified" as const;
  if (status === "Pending" || status === "Missing evidence")
    return "warning" as const;
  return "outline" as const;
}

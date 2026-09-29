export type FraudCluster = "devnet" | "localnet";
export type FraudDisposition =
  | "needs_investigation"
  | "confirmed_fraud"
  | "false_positive";
export type FraudReason = {
  code: string;
  message: string;
  weight: number;
  source_addresses: string[];
};
export type FraudFinding = {
  id: string;
  subject_address: string;
  severity: "medium" | "high";
  status: "open" | "reviewed";
  score: number;
  risk_band: "low" | "medium" | "high";
  model_version: string;
  reasons: FraudReason[];
  created_at: string;
};
export type FraudSubject = {
  subject_address: string;
  score: number;
  risk_band: "low" | "medium" | "high";
  model_version: string;
  checkpoint_signature: string | null;
  checkpoint_slot: string | number;
  reasons: FraudReason[];
  features: Record<string, unknown>;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function json(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function reasons(value: unknown): FraudReason[] {
  const raw = json(value);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const record = object(item);
    if (
      !record ||
      typeof record.code !== "string" ||
      typeof record.message !== "string" ||
      typeof record.weight !== "number"
    )
      return [];
    return [{
      code: record.code,
      message: record.message,
      weight: record.weight,
      source_addresses: Array.isArray(record.source_addresses)
        ? record.source_addresses.filter((address): address is string => typeof address === "string")
        : [],
    }];
  });
}
function risk(value: unknown): "low" | "medium" | "high" | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

export function parseFindings(value: unknown): FraudFinding[] {
  if (!Array.isArray(value)) throw new Error("Fraud service returned an invalid finding list");
  return value.flatMap((item) => {
    const row = object(item);
    const severity = risk(row?.severity);
    const riskBand = risk(row?.risk_band);
    if (
      !row ||
      (severity !== "medium" && severity !== "high") ||
      !riskBand ||
      typeof row.id !== "string" ||
      typeof row.subject_address !== "string" ||
      typeof row.status !== "string" ||
      typeof row.score !== "number" ||
      typeof row.model_version !== "string" ||
      typeof row.created_at !== "string"
    )
      return [];
    return [{
      id: row.id,
      subject_address: row.subject_address,
      severity,
      status: row.status === "reviewed" ? "reviewed" : "open",
      score: row.score,
      risk_band: riskBand,
      model_version: row.model_version,
      reasons: reasons(row.reasons_json),
      created_at: row.created_at,
    }];
  });
}

export function parseSubject(value: unknown): FraudSubject {
  const row = object(value);
  const riskBand = risk(row?.risk_band);
  const features = object(json(row?.features_json));
  if (
    !row ||
    !riskBand ||
    !features ||
    typeof row.subject_address !== "string" ||
    typeof row.score !== "number" ||
    typeof row.model_version !== "string" ||
    (typeof row.checkpoint_slot !== "string" && typeof row.checkpoint_slot !== "number")
  )
    throw new Error("Fraud service returned invalid subject data");
  return {
    subject_address: row.subject_address,
    score: row.score,
    risk_band: riskBand,
    model_version: row.model_version,
    checkpoint_signature: typeof row.checkpoint_signature === "string" ? row.checkpoint_signature : null,
    checkpoint_slot: row.checkpoint_slot,
    reasons: reasons(row.reasons_json),
    features,
  };
}

export function isFraudCluster(value: string | null): value is FraudCluster {
  return value === "devnet" || value === "localnet";
}

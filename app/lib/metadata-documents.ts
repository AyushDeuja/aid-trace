import { createHash, randomUUID } from "node:crypto";
import { database } from "./organizations/db";
import { validateMetadata, type OrganizationMetadata } from "./organizations/metadata";
import { validateCampaignMetadata, type CampaignMetadata } from "./campaigns/schema";

export type AllocationMetadata = {
  purpose: string;
  category: string;
  description: string;
};
export type DisbursementMetadata = { description: string };

export type MetadataKind = "organization" | "campaign" | "allocation" | "disbursement";
export type MetadataDocument = {
  uri: string;
  digest: string;
  metadata: OrganizationMetadata | CampaignMetadata | AllocationMetadata | DisbursementMetadata;
};

const uriPattern = /^aidtrace:\/\/(organization|campaign|allocation|disbursement)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export async function ensureMetadataSchema() {
  await database().query(`
    CREATE TABLE IF NOT EXISTS metadata_documents (
      id uuid PRIMARY KEY,
      kind text NOT NULL CHECK (kind IN ('organization', 'campaign', 'allocation', 'disbursement')),
      canonical_json text NOT NULL,
      digest char(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // Existing local databases were created before finance metadata kinds existed.
  await database().query(`
    ALTER TABLE metadata_documents DROP CONSTRAINT IF EXISTS metadata_documents_kind_check;
    ALTER TABLE metadata_documents ADD CONSTRAINT metadata_documents_kind_check
      CHECK (kind IN ('organization', 'campaign', 'allocation', 'disbursement'));
  `);
}

function text(value: unknown, field: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`Invalid ${field}`);
  return value.trim();
}
function normalize(kind: MetadataKind, value: unknown) {
  if (kind === "organization") return validateMetadata(value);
  if (kind === "campaign") return validateCampaignMetadata(value);
  if (!value || typeof value !== "object") throw new Error("Invalid metadata");
  const record = value as Record<string, unknown>;
  if (kind === "allocation")
    return {
      purpose: text(record.purpose, "purpose", 120),
      category: text(record.category, "category", 80),
      description: text(record.description, "description", 2_000),
    } satisfies AllocationMetadata;
  return { description: text(record.description, "description", 2_000) } satisfies DisbursementMetadata;
}

export function parseMetadataUri(uri: string, expectedKind?: MetadataKind) {
  const match = uriPattern.exec(uri);
  if (!match || (expectedKind && match[1] !== expectedKind))
    throw new Error("Invalid AidTrace metadata reference");
  return { kind: match[1] as MetadataKind, id: match[2] };
}

export async function createMetadataDocument(
  kind: MetadataKind,
  value: unknown
): Promise<MetadataDocument> {
  const metadata = normalize(kind, value);
  const canonicalJson = JSON.stringify(metadata);
  const digest = createHash("sha256").update(canonicalJson).digest("hex");
  const id = randomUUID();
  await ensureMetadataSchema();
  await database().query(
    `INSERT INTO metadata_documents (id, kind, canonical_json, digest)
     VALUES ($1, $2, $3, $4)`,
    [id, kind, canonicalJson, digest]
  );
  return { uri: `aidtrace://${kind}/${id}`, digest, metadata };
}

export async function readMetadataDocument(
  uri: string,
  expectedKind?: MetadataKind
): Promise<MetadataDocument> {
  const { kind, id } = parseMetadataUri(uri, expectedKind);
  await ensureMetadataSchema();
  const result = await database().query(
    `SELECT canonical_json, digest FROM metadata_documents WHERE id = $1 AND kind = $2`,
    [id, kind]
  );
  if (!result.rows[0]) throw new Error("Metadata document not found");
  const metadata = normalize(kind, JSON.parse(result.rows[0].canonical_json));
  const canonicalJson = JSON.stringify(metadata);
  const digest = createHash("sha256").update(canonicalJson).digest("hex");
  if (digest !== result.rows[0].digest)
    throw new Error("Stored metadata digest is invalid");
  return { uri, digest, metadata };
}

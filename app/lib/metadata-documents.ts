import { createHash, randomUUID } from "node:crypto";
import { database } from "./organizations/db";
import { validateMetadata, type OrganizationMetadata } from "./organizations/metadata";
import {
  validateCampaignMetadata,
  type CampaignMetadata,
} from "./campaigns/schema";

export type MetadataKind = "organization" | "campaign";
export type MetadataDocument = {
  uri: string;
  digest: string;
  metadata: OrganizationMetadata | CampaignMetadata;
};

const uriPattern = /^aidtrace:\/\/(organization|campaign)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export async function ensureMetadataSchema() {
  await database().query(`
    CREATE TABLE IF NOT EXISTS metadata_documents (
      id uuid PRIMARY KEY,
      kind text NOT NULL CHECK (kind IN ('organization', 'campaign')),
      canonical_json text NOT NULL,
      digest char(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

function normalize(kind: MetadataKind, value: unknown) {
  return kind === "organization"
    ? validateMetadata(value)
    : validateCampaignMetadata(value);
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

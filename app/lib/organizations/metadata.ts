import { sha256Hex } from "./chain";

export type OrganizationMetadata = {
  name: string;
  description: string;
  website?: string;
};
export function validateMetadata(value: unknown): OrganizationMetadata {
  if (!value || typeof value !== "object")
    throw new Error("Invalid organization metadata");
  const data = value as Record<string, unknown>;
  if (
    typeof data.name !== "string" ||
    data.name.trim().length < 2 ||
    data.name.length > 120
  )
    throw new Error("Name must be 2–120 characters");
  if (
    typeof data.description !== "string" ||
    data.description.trim().length < 10 ||
    data.description.length > 2000
  )
    throw new Error("Description must be 10–2000 characters");
  if (
    data.website !== undefined &&
    (typeof data.website !== "string" || !/^https:\/\//.test(data.website))
  )
    throw new Error("Website must be HTTPS");
  return {
    name: data.name.trim(),
    description: data.description.trim(),
    ...(data.website ? { website: data.website as string } : {}),
  };
}
export function validateMetadataUri(uri: string) {
  const parsed = new URL(uri);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "ipfs.io" ||
    !/^\/ipfs\/[a-zA-Z0-9]+$/.test(parsed.pathname) ||
    uri.length > 500 ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("Metadata URI must be an ipfs.io content URL");
  return uri;
}
export async function fetchVerifiedMetadata(uri: string, digest: string) {
  if (uri.startsWith("aidtrace://")) {
    const { readMetadataDocument } = await import("../metadata-documents");
    const result = await readMetadataDocument(uri, "organization");
    if (result.digest !== digest)
      throw new Error("Metadata SHA-256 does not match the on-chain digest");
    return result.metadata as OrganizationMetadata;
  }
  const result = await fetchMetadataWithDigest(uri);
  if (result.digest !== digest)
    throw new Error("Metadata SHA-256 does not match the on-chain digest");
  return result.metadata;
}
export async function fetchMetadataWithDigest(uri: string) {
  validateMetadataUri(uri);
  const response = await fetch(uri, {
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error("Metadata could not be fetched");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 16_384) throw new Error("Metadata is too large");
  return {
    digest: await sha256Hex(bytes),
    metadata: validateMetadata(JSON.parse(new TextDecoder().decode(bytes))),
  };
}

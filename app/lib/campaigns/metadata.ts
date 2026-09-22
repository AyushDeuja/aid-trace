import { validateMetadataUri } from "../organizations/metadata";

export type CampaignMetadata = {
  title: string;
  description: string;
  disasterType: string;
  location: string;
};
export function validateCampaignMetadata(value: unknown): CampaignMetadata {
  if (!value || typeof value !== "object")
    throw new Error("Invalid campaign metadata");
  const data = value as Record<string, unknown>;
  for (const key of ["title", "description", "disasterType", "location"]) {
    if (
      typeof data[key] !== "string" ||
      !(data[key] as string).trim() ||
      (data[key] as string).length > 2000
    )
      throw new Error(`Invalid ${key}`);
  }
  return {
    title: (data.title as string).trim(),
    description: (data.description as string).trim(),
    disasterType: (data.disasterType as string).trim(),
    location: (data.location as string).trim(),
  };
}
export async function fetchCampaignMetadata(uri: string) {
  validateMetadataUri(uri);
  const response = await fetch(uri, {
    signal: AbortSignal.timeout(8000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Campaign metadata could not be fetched");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 16_384) throw new Error("Campaign metadata too large");
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0")
  ).join("");
  return {
    digest,
    metadata: validateCampaignMetadata(
      JSON.parse(new TextDecoder().decode(bytes))
    ),
  };
}

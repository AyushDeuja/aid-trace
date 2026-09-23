import { validateMetadataUri } from "../organizations/metadata";
import { readMetadataDocument } from "../metadata-documents";
import {
  validateCampaignMetadata,
  type CampaignMetadata,
} from "./schema";

export { validateCampaignMetadata, type CampaignMetadata } from "./schema";
export async function fetchCampaignMetadata(uri: string) {
  if (uri.startsWith("aidtrace://"))
    return readMetadataDocument(uri, "campaign") as Promise<{
      digest: string;
      metadata: CampaignMetadata;
      uri: string;
    }>;
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

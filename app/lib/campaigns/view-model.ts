import type { Campaign } from "./chain";
import type { CampaignMetadata } from "./schema";

export type CampaignMetadataState =
  "verified" | "unavailable" | "digest_mismatch";

export type CampaignPresentation = {
  campaign: Campaign;
  metadata: CampaignMetadata | null;
  metadataState: CampaignMetadataState;
  title: string;
  description: string;
  location: string;
  disasterType: string;
};

export async function resolveCampaignPresentation(
  campaign: Campaign
): Promise<CampaignPresentation> {
  const fallback = {
    campaign,
    metadata: null,
    metadataState: "unavailable" as const,
    title: `Campaign #${campaign.campaignId}`,
    description:
      "Canonical campaign details are available on the selected Solana cluster.",
    location: "Location unavailable",
    disasterType: "Disaster type unavailable",
  };
  try {
    const response = await fetch(
      `/api/campaigns/metadata?uri=${encodeURIComponent(campaign.metadataUri)}`
    );
    const body = await response.json();
    if (!response.ok || !body?.metadata) return fallback;
    if (body.digest !== campaign.metadataDigest) {
      return { ...fallback, metadataState: "digest_mismatch" };
    }
    const metadata = body.metadata as CampaignMetadata;
    return {
      campaign,
      metadata,
      metadataState: "verified",
      title: metadata.title,
      description: metadata.description,
      location: metadata.location,
      disasterType: metadata.disasterType,
    };
  } catch {
    return fallback;
  }
}

export function campaignProgress(campaign: Campaign) {
  if (campaign.targetAmount <= 0n) return 0;
  return Math.min(
    100,
    Number((campaign.amountRaised * 10000n) / campaign.targetAmount) / 100
  );
}

export function campaignAvailable(campaign: Campaign) {
  return (
    campaign.amountRaised - campaign.amountReserved - campaign.amountDisbursed
  );
}

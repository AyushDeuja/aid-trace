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

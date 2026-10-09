import { NextResponse } from "next/server";
import { campaignDetailReadModel } from "../../../lib/read-models";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const campaign = url.searchParams.get("campaign");
  if (!campaign)
    return NextResponse.json(
      { error: "campaign is required" },
      { status: 400 }
    );
  const model = await campaignDetailReadModel(
    url.searchParams.get("cluster"),
    campaign
  );
  return model
    ? NextResponse.json(model)
    : NextResponse.json(
        { error: "Indexed campaign was not found" },
        { status: 404 }
      );
}

import { NextRequest, NextResponse } from "next/server";
import { issueAdminChallenge } from "../../../lib/admin-auth";
const actions = new Set(["review_finding", "run_scoring"]);
export async function POST(request: NextRequest) { try { const body = await request.json(); if (typeof body?.wallet !== "string" || !actions.has(body?.action) || (body.resourceId !== undefined && typeof body.resourceId !== "string")) throw new Error("Invalid challenge request"); return NextResponse.json(await issueAdminChallenge(body.wallet, body.action, body.resourceId)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 }); } }

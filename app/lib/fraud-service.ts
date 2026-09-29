import "server-only";
import { NextResponse } from "next/server";

const serviceUrl = process.env.FRAUD_SERVICE_URL;

export async function proxyFraud(path: string, init?: RequestInit) {
  if (!serviceUrl)
    return NextResponse.json({ error: "Fraud service is not configured" }, { status: 503 });
  try {
    const response = await fetch(new URL(path, serviceUrl), {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = body && typeof body === "object" && "detail" in body && typeof body.detail === "string"
        ? body.detail
        : "Fraud service request failed";
      return NextResponse.json({ error: detail }, { status: response.status });
    }
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "Fraud service is unavailable" }, { status: 503 });
  }
}

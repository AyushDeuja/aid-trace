import { proxyFraud } from "../../../lib/fraud-service";
export const runtime = "nodejs";
export async function GET() {
  return proxyFraud("/health");
}

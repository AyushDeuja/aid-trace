import { ingestDisasters } from "../app/lib/disasters.ts";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
console.log(JSON.stringify(await ingestDisasters()));

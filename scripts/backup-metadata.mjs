import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const run = promisify(execFile);
const directory = path.join(process.cwd(), "data", "backups", "postgres");
await mkdir(directory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archive = path.join(directory, `metadata-documents-${stamp}.dump`);
await run("pg_dump", ["--format=custom", "--file", archive, "--table=public.metadata_documents", process.env.DATABASE_URL]);
await run("pg_restore", ["--list", archive]);
const checksum = createHash("sha256").update(await readFile(archive)).digest("hex");
await writeFile(`${archive}.sha256`, `${checksum}  ${path.basename(archive)}\n`, { flag: "wx" });
console.log(`Backed up metadata documents to ${archive}`);

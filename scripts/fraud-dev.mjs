import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

function loadDotEnv(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const fromFile = loadDotEnv(resolve(".env"));
const env = { ...fromFile, ...process.env };
if (!env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required; add it to .env or the environment"
  );
}

const child = spawn(
  process.platform === "win32" ? "python" : "python3",
  ["-m", "uvicorn", "fraud_service.app:app", "--reload", "--port", "8001"],
  { cwd: resolve("services/fraud"), env, stdio: "inherit" }
);

child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error("fraud service startup failed", { error: error.message });
  process.exit(1);
});

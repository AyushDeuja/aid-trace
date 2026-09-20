import { execFileSync } from "node:child_process";

const requirements = [
  { version: process.version, label: "node", expected: "v22.22.3" },
  { command: "rustc", expected: "1.96.1" },
  { command: "python", expected: "3.12.0" },
  { command: "solana", expected: "3.1.10" },
  { command: "anchor", expected: "1.1.1" },
];

let failed = false;

for (const { command, label = command, expected, version } of requirements) {
  try {
    const output = (
      version ??
      execFileSync(command, ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    ).trim();
    const matches = output.includes(expected);
    console.log(`${matches ? "ok" : "mismatch"}: ${label} ${output}`);
    failed ||= !matches;
  } catch {
    console.log(`missing: ${label} (requires ${expected})`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;

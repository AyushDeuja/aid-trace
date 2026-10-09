import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  [new URL("./index-chain.mjs", import.meta.url).pathname],
  {
    stdio: "inherit",
    env: process.env,
  }
);
process.exit(result.status ?? 1);

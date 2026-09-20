# AidTrace toolchain

This repository pins the runtime used to develop AidTrace. Run `npm run toolchain`
before program work; it reports missing or incompatible required commands.

| Tool       | Required version     | Current local state |
| ---------- | -------------------- | ------------------- |
| Node.js    | 22.22.3              | installed           |
| npm        | bundled with Node.js | installed           |
| Rust       | 1.96.1               | installed           |
| Python     | 3.12.0               | installed           |
| Anchor CLI | 1.1.1                | installed           |
| Solana CLI | 3.1.10               | WSL/Linux required  |

Anchor 1.1.1 recommends Solana 3.1.10. Anchor is installed through AVM. The
official Solana 3.1.10 installer is Unix-only, so on Windows install it from
WSL before running `anchor build` or `anchor test`. The `aidtrace` workspace is
present; the old generated vault artifacts are not part of the product
implementation.

Use `.nvmrc`, `.python-version`, and `rust-toolchain.toml` with the matching
version managers. No secret belongs in a committed environment file; begin
from `.env.example` for local configuration.

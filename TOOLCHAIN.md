# AidTrace toolchain

This repository pins the runtime used to develop AidTrace. Run `npm run toolchain`
before program work; it reports missing or incompatible required commands.

| Tool       | Required version     | Current local state |
| ---------- | -------------------- | ------------------- |
| Node.js    | 22.22.3              | installed           |
| npm        | bundled with Node.js | installed           |
| Rust       | 1.96.1               | installed           |
| Python     | 3.12.0               | installed           |
| Anchor CLI | 1.1.1                | install required    |
| Solana CLI | 3.1.10               | install required    |

Anchor 1.1.1 recommends Solana 3.1.10. Install Anchor through AVM and install
the matching Solana CLI before creating or building the Anchor workspace. The
workspace and `aidtrace` program are deliberately created in ClickUp task 01;
the old generated vault artifacts are not part of the product implementation.

Use `.nvmrc`, `.python-version`, and `rust-toolchain.toml` with the matching
version managers. No secret belongs in a committed environment file; begin
from `.env.example` for local configuration.

# AidTrace advisory fraud service

This service is intentionally not a trained machine-learning model. `rules-graph-v1`
scores only finalized PostgreSQL projections and produces reviewable risk indicators.
It has no Solana RPC, wallet, signer, or transaction dependency.

## Setup

From the repository root, apply the shared schema migration first:

```bash
npm run db:migrate
```

Create a Python virtual environment once, install dependencies, and configure
the root server-only `.env` with the same `DATABASE_URL` used by Next.js plus
`FRAUD_SERVICE_URL=http://127.0.0.1:8001`:

```bash
cd services/fraud
py -m venv .venv
.\.venv\Scripts\Activate.ps1   # Unix: source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

From the repository root, the normal local workflow is:

```bash
npm run db:migrate
npm run index:chain
npm run fraud:score
npm run fraud:dev
```

Run `npm run dev` in a second terminal. Re-run indexing and scoring after new
finalized projections are available.

Use `http://localhost:8001/docs` for the local API documentation. The only
mutable endpoints write advisory Postgres evaluations/findings/reviews; none
can change a Solana account or move funds.

# AidTrace advisory fraud service

This service is intentionally not a trained machine-learning model. `rules-graph-v1`
scores only finalized PostgreSQL projections and produces reviewable risk indicators.
It has no Solana RPC, wallet, signer, or transaction dependency.

## Setup

From the repository root, apply the shared schema migration first:

```bash
npm run db:migrate
```

Create a Python virtual environment, install dependencies, and export the same
`DATABASE_URL` used by the Next.js application:

```bash
cd services/fraud
python -m venv .venv
source .venv/bin/activate   # Windows PowerShell: .venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
export DATABASE_URL='postgresql://...'
```

Run one advisory scoring pass after `npm run index:chain`:

```bash
PYTHONPATH=. python -m fraud_service.cli --cluster devnet
```

Start the API:

```bash
PYTHONPATH=. uvicorn fraud_service.app:app --reload --port 8001
```

Use `http://localhost:8001/docs` for the local API documentation. The only
mutable endpoints write advisory Postgres evaluations/findings/reviews; none
can change a Solana account or move funds.

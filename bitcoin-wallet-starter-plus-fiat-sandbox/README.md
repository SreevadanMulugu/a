# Bitcoin Wallet + Fiat Sandbox
**Testnet wallet + mock Fiat Orchestrator (no real money).**

## 1) Backend (Fiat Orchestrator Sandbox)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
API: http://localhost:8000/docs

## 2) Web (Wallet + Fiat tab)
```bash
cd web
npm install
# point the web app to backend by setting env var:
# Linux/macOS:  VITE_API=http://localhost:8000 npm run dev
# Windows PowerShell:  setx VITE_API http://localhost:8000; npm run dev
npm run dev
```
Open the shown localhost URL. In the **Fiat (Sandbox)** tab: start KYC, get a quote, start onramp. This **does not** move real money or BTC; it’s for wiring & UX testing only. Use a testnet faucet to fund your receive address for crypto tests.

## Production Notes
- Replace sandbox with a real, licensed on/off‑ramp provider via adapters in the Fiat Orchestrator.
- Keep the wallet self‑custodial (no server private keys). Use descriptors/xpubs for watch‑only services.
- Add Lightning for instant app→app transfers (LDK on device or LND/CLN backend).
- Enforce KYC/AML, per‑user limits, webhooks with signatures, and Travel Rule where applicable.

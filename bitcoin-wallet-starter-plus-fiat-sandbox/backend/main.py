from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict
import time

app = FastAPI(title="Fiat Orchestrator Sandbox", version="0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

USERS: Dict[str, dict] = {}

class KycStartReq(BaseModel):
    user_id: str

class FiatQuoteReq(BaseModel):
    user_id: str
    amount: float
    currency: str

class OnrampStartReq(FiatQuoteReq):
    dest_address: str

@app.post("/kyc/start")
def kyc_start(body: KycStartReq):
    USERS.setdefault(body.user_id, {})
    USERS[body.user_id]["kyc"] = {"status": "pending", "started_at": time.time()}
    return {"status": "pending", "session_url": "https://sandbox-kyc.example/start"}

@app.get("/kyc/status")
def kyc_status(user_id: str):
    kyc = USERS.get(user_id, {}).get("kyc", {"status":"none"})
    # auto-approve after 3 seconds for demo
    if kyc.get("status") == "pending" and time.time() - kyc.get("started_at", 0) > 3:
        kyc["status"] = "approved"
    return {"status": kyc.get("status", "none")}

@app.post("/fiat/onramp/quote")
def onramp_quote(body: FiatQuoteReq):
    # Dummy FX rate and fee schedule
    fx_rate_inr_btc = 1 / 5000000.0  # 1 BTC ~ 50,00,000 INR (mock)
    btc_out = body.amount * fx_rate_inr_btc
    fees = max(10.0, 0.01 * body.amount)  # 1% or min 10 INR
    return {"rate": fx_rate_inr_btc, "btc_out": btc_out, "fees": fees, "currency": body.currency}

@app.post("/fiat/onramp/start")
def onramp_start(body: OnrampStartReq):
    if USERS.get(body.user_id, {}).get("kyc", {}).get("status") != "approved":
        return {"error": "kyc_required"}
    intent_id = f"intent_{int(time.time())}"
    # In sandbox we do not move real money or BTC.
    return {"intent_id": intent_id, "status": "created", "redirect_url": "https://sandbox-pay.example/redirect"}

@app.post("/webhooks/partner")
def partner_webhook(req: Request):
    # Accept any payload; in a real system validate HMAC signature
    return {"ok": True}

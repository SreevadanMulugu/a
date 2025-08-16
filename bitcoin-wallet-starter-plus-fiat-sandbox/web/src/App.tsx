import React, { useMemo, useState, useEffect } from 'react'
import * as bip39 from 'bip39'
import * as bip32 from 'bip32'
import * as bitcoin from 'bitcoinjs-lib'
import * as secp from 'tiny-secp256k1'
import axios from 'axios'
;(bitcoin as any).initEccLib(secp)

const network = bitcoin.networks.testnet
const derivation = "m/84'/1'/0'"
const API = import.meta.env.VITE_API || 'http://localhost:8000'

type Utxo = { txid: string; vout: number; value: number; scriptpubkey: string }
type Tab = 'wallet' | 'fiat'

function loadOrCreateSeed() {
  const saved = localStorage.getItem('mnemonic')
  if (saved) return saved
  const mnemonic = bip39.generateMnemonic(256)
  localStorage.setItem('mnemonic', mnemonic)
  return mnemonic
}

function deriveAccount(mnemonic: string) {
  const seed = bip39.mnemonicToSeedSync(mnemonic)
  const root = bip32.fromSeed(seed, network)
  return root.derivePath(derivation)
}

function addressAt(account: bip32.BIP32Interface, change: 0|1, index: number) {
  const node = account.derive(change).derive(index)
  const { address } = bitcoin.payments.p2wpkh({ pubkey: node.publicKey, network })
  if (!address) throw new Error('no address')
  return { address, node }
}

async function fetchUtxos(addr: string): Promise<Utxo[]> {
  const r = await fetch(`https://blockstream.info/testnet/api/address/${addr}/utxo`)
  const data = await r.json()
  return data.map((u: any) => ({ txid: u.txid, vout: u.vout, value: u.value, scriptpubkey: u.scriptpubkey }))
}

async function broadcast(hex: string) {
  const r = await fetch('https://blockstream.info/testnet/api/tx', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: hex })
  return r.text()
}

export default function App() {
  const [tab, setTab] = useState<Tab>('wallet')
  const [mnemonic, setMnemonic] = useState(loadOrCreateSeed())
  const account = useMemo(() => deriveAccount(mnemonic), [mnemonic])
  const [recvIndex, setRecvIndex] = useState(0)
  const [sendIndex, setSendIndex] = useState(0)
  const receive = addressAt(account, 0, recvIndex).address
  const change = addressAt(account, 1, sendIndex).address

  const [addr, setAddr] = useState(receive)
  useEffect(() => setAddr(receive), [receive])

  const [utxos, setUtxos] = useState<Utxo[]>([])
  const [balance, setBalance] = useState<number>(0)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [feerate, setFeerate] = useState('5')
  const [status, setStatus] = useState('')

  async function refresh() {
    const u = await fetchUtxos(addr)
    setUtxos(u)
    setBalance(u.reduce((s, x) => s + x.value, 0))
  }

  useEffect(() => { refresh() }, [])

  async function send() {
    setStatus('Building...')
    const sats = Math.floor(Number(amount) * 1e8)
    if (!to || !sats) { setStatus('Enter address and amount'); return }
    const feeRate = Math.max(1, Math.floor(Number(feerate)))
    const psbt = new bitcoin.Psbt({ network })

    let selected: Utxo[] = []; let total = 0
    for (const u of utxos) { selected.push(u); total += u.value; if (total >= sats) break }
    if (total < sats) { setStatus('Insufficient'); return }
    const vsize = selected.length * 110 + 31 * 2 + 10
    const fee = feeRate * vsize
    const changeAmt = total - sats - fee
    if (changeAmt < 0) { setStatus('Insufficient for fee'); return }

    for (const u of selected) {
      psbt.addInput({ hash: u.txid, index: u.vout, witnessUtxo: { script: Buffer.from(u.scriptpubkey, 'hex'), value: u.value } })
    }
    psbt.addOutput({ address: to, value: sats })
    if (changeAmt > 546) psbt.addOutput({ address: change, value: changeAmt })

    // naive signer: scan indexes
    const maxIndex = Math.max(recvIndex + 3, sendIndex + 3)
    const candidates: any[] = []
    for (let c of [0,1] as const) for (let i = 0; i <= maxIndex; i++) candidates.push({ node: account.derive(c).derive(i) })
    for (let i = 0; i < psbt.inputCount; i++) {
      const script = (psbt.data.inputs[i].witnessUtxo as any).script as Buffer
      const target = candidates.find(c => bitcoin.payments.p2wpkh({ pubkey: c.node.publicKey, network }).output!.toString('hex') === script.toString('hex'))
      if (!target) throw new Error('key not found for input')
      psbt.signInput(i, target.node)
    }
    psbt.finalizeAllInputs()
    const txid = await (await fetch('https://blockstream.info/testnet/api/tx', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: psbt.extractTransaction().toHex() })).text()
    setStatus('Sent ' + txid)
    setRecvIndex(recvIndex + 1); setSendIndex(sendIndex + 1)
    await refresh()
  }

  // --- Fiat Sandbox ----
  const [kyc, setKyc] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none')
  const [fiatAmount, setFiatAmount] = useState('1000') // e.g., INR
  const [quote, setQuote] = useState<any>(null)
  const [fiatStatus, setFiatStatus] = useState('')

  async function kycStart() {
    const r = await axios.post(API + '/kyc/start', { user_id: 'demo' })
    setKyc('pending')
    setFiatStatus('KYC started (sandbox).')
  }
  async function kycPoll() {
    const r = await axios.get(API + '/kyc/status', { params: { user_id: 'demo' } })
    setKyc(r.data.status)
  }

  async function onrampQuote() {
    const r = await axios.post(API + '/fiat/onramp/quote', { user_id: 'demo', amount: Number(fiatAmount), currency: 'INR' })
    setQuote(r.data)
  }
  async function onrampStart() {
    const r = await axios.post(API + '/fiat/onramp/start', { user_id: 'demo', amount: Number(fiatAmount), currency: 'INR', dest_address: addr })
    setFiatStatus('Onramp intent created (sandbox). Simulated settlement will not move coins; use a testnet faucet to fund the receive address.')
  }

  return (
    <div className="container">
      <div className="nav">
        <button className={tab==='wallet'?'active':''} onClick={()=>setTab('wallet')}>Wallet</button>
        <button className={tab==='fiat'?'active':''} onClick={()=>setTab('fiat')}>Fiat (Sandbox)</button>
      </div>

      {tab==='wallet' && <div>
        <div className="card">
          <h2>Seed (testnet)</h2>
          <p style={{wordBreak:'break-word'}}>{mnemonic}</p>
          <div className="row">
            <button className="secondary" onClick={()=>{ const m=bip39.generateMnemonic(256); localStorage.setItem('mnemonic', m); location.reload()}}>New Seed</button>
          </div>
        </div>

        <div className="card">
          <h2>Receive</h2>
          <label>Address</label>
          <input value={addr} onChange={e=>setAddr(e.target.value)} />
          <p>Path: <code>{`m/84'/1'/0'/0/${recvIndex}`}</code></p>
          <div className="row">
            <button className="primary" onClick={()=>{ location.href = `bitcoin:${addr}`}}>Open in wallet</button>
            <button className="secondary" onClick={()=>navigator.clipboard.writeText(addr)}>Copy</button>
            <button className="secondary" onClick={()=>setRecvIndex(recvIndex+1)}>New Address</button>
          </div>
        </div>

        <div className="card">
          <h2>Balance & Send</h2>
          <div className="row">
            <div><label>Balance (sats)</label><input readOnly value={balance}/></div>
            <div><label>To</label><input value={to} onChange={e=>setTo(e.target.value)} placeholder="tb1..." /></div>
            <div><label>Amount (BTC)</label><input value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.0001" /></div>
            <div><label>Fee (sat/vB)</label><input value={feerate} onChange={e=>setFeerate(e.target.value)} /></div>
          </div>
          <div className="row"><button className="primary" onClick={send}>Send</button><button className="secondary" onClick={refresh}>Refresh</button></div>
          <p>{status}</p>
        </div>
      </div>}

      {tab==='fiat' && <div>
        <div className="card">
          <h2>Fiat Sandbox (Bank ↔ BTC)</h2>
          <p>This simulates real-money flows (KYC, quotes, onramp). No real funds move in sandbox; your BTC still comes from testnet faucets.</p>
          <div className="row">
            <div>
              <label>KYC Status</label>
              <input readOnly value={kyc} />
              <div className="row">
                <button className="primary" onClick={kycStart}>Start KYC (mock)</button>
                <button className="secondary" onClick={kycPoll}>Refresh</button>
              </div>
            </div>
            <div>
              <label>Onramp Amount (INR)</label>
              <input value={fiatAmount} onChange={e=>setFiatAmount(e.target.value)} />
              <div className="row">
                <button className="secondary" onClick={onrampQuote}>Quote</button>
                <button className="primary" onClick={onrampStart} disabled={kyc!=='approved'}>Start Onramp</button>
              </div>
            </div>
          </div>
          <pre>{quote ? JSON.stringify(quote,null,2) : ''}</pre>
          <p>{fiatStatus}</p>
        </div>
      </div>}
    </div>
  )
}

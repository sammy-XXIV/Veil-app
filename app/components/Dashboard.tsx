'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ethers } from 'ethers';
import { VEIL_ADDRESS, CWETH_ADDRESS, CWETH_DECIMALS, VEIL_ABI, CWETH_ABI } from '../lib/contract';
import { useFHE } from '../hooks/useFHE';

const BACKEND = 'https://veil-backend-2gki.onrender.com';

export default function Dashboard() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { sdkReady, loading: sdkLoading, encrypt, getUserBalance } = useFHE();

  const [position, setPosition] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [ethPrice, setEthPrice] = useState(3000);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [depositAmt, setDepositAmt] = useState('');
  const [borrowAmt, setBorrowAmt] = useState('');
  const [repayAmt, setRepayAmt] = useState('');
  const [loading, setLoading] = useState(false);
  const [txLog, setTxLog] = useState<string[]>([]);
  const [cwethBalance, setCwethBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [fheStep, setFheStep] = useState(0);
  const [fheAction, setFheAction] = useState('');

  const log = (msg: string) => setTxLog(prev => [msg, ...prev].slice(0, 5));

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).ethereum) return;
    (window as any).ethereum.request({ method: 'eth_chainId' }).then((id: string) => setWrongNetwork(id !== '0xaa36a7'));
    (window as any).ethereum.on('chainChanged', (id: string) => setWrongNetwork(id !== '0xaa36a7'));
  }, []);

  useEffect(() => {
    fetch('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD')
      .then(r => r.json()).then(d => { if (d.USD) setEthPrice(Math.round(d.USD)); }).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    if (!publicClient || !address) return;
    try {
      const meta = await publicClient.readContract({ address: VEIL_ADDRESS as `0x${string}`, abi: VEIL_ABI as any, functionName: 'getPositionMeta', args: [address] }) as any;
      setPosition({ exists: meta[0], openedAt: meta[1], collateralPlain: meta[2], debtPlain: meta[3] });
      const s = await publicClient.readContract({ address: VEIL_ADDRESS as `0x${string}`, abi: VEIL_ABI as any, functionName: 'getStats' }) as any;
      setStats({ positions: s[0], pool: s[1] });
    } catch(e) { console.error(e); }
  }, [publicClient, address]);

  useEffect(() => { loadData(); }, [loadData]);

  const getSigner = async () => {
    if (!walletClient) throw new Error('No wallet');
    const provider = new ethers.BrowserProvider((walletClient as any).transport);
    return provider.getSigner();
  };

  const showCwethBalance = async () => {
    if (!address || !sdkReady) return log('FHE SDK not ready');
    setBalanceLoading(true);
    try {
      const handle = await publicClient!.readContract({ address: CWETH_ADDRESS as `0x${string}`, abi: CWETH_ABI as any, functionName: 'confidentialBalanceOf', args: [address] }) as string;
      if (!handle || handle === ethers.ZeroHash) { setCwethBalance('0'); return; }
      const signer = await getSigner();
      const balance = await getUserBalance(handle, CWETH_ADDRESS, address, signer);
      if (balance !== null) setCwethBalance(parseFloat(ethers.formatUnits(balance, CWETH_DECIMALS)).toFixed(4));
      else log('Balance decryption failed');
    } catch(e: any) { log(e.message?.slice(0, 50)); }
    finally { setBalanceLoading(false); }
  };

  const doTx = async (label: string, fn: () => Promise<void>) => {
    setLoading(true); setFheAction(label); setFheStep(1); log(`${label}...`);
    try { await fn(); log(`✅ ${label} done`); loadData(); }
    catch(e: any) { log(`❌ ${e.message?.slice(0, 60)}`); }
    finally { setLoading(false); setFheStep(0); }
  };

  const handleDeposit = () => doTx(position?.exists ? 'Add Collateral' : 'Open Position', async () => {
    const signer = await getSigner();
    const wei = ethers.parseUnits(depositAmt, CWETH_DECIMALS);
    const cweth = new ethers.Contract(CWETH_ADDRESS, CWETH_ABI as any, signer);
    if (!await cweth.isOperator(address!, VEIL_ADDRESS)) {
      log('Approving...');
      await (await cweth.setOperator(VEIL_ADDRESS, Math.floor(Date.now()/1000)+31536000)).wait();
    }
    setFheStep(2); log('Encrypting...');
    const { handle, proof } = await encrypt(wei, address!);
    setFheStep(3); log('Signing...');
    const veil = new ethers.Contract(VEIL_ADDRESS, VEIL_ABI as any, signer);
    const tx = await veil[position?.exists ? 'addCollateral' : 'openPosition'](handle, proof, wei);
    setFheStep(4); log('Confirming...');
    await tx.wait();
    setDepositAmt(''); setCwethBalance(null);
  });

  const handleBorrow = () => doTx('Borrow', async () => {
    const signer = await getSigner();
    const wei = ethers.parseUnits(borrowAmt, CWETH_DECIMALS);
    setFheStep(2); log('Encrypting...');
    const { handle, proof } = await encrypt(wei, address!);
    setFheStep(3);
    const veil = new ethers.Contract(VEIL_ADDRESS, VEIL_ABI as any, signer);
    setFheStep(4);
    await (await veil.borrow(handle, proof, wei)).wait();
    setBorrowAmt('');
  });

  const handleRepay = () => doTx('Repay', async () => {
    const signer = await getSigner();
    const wei = ethers.parseUnits(repayAmt, CWETH_DECIMALS);
    const cweth = new ethers.Contract(CWETH_ADDRESS, CWETH_ABI as any, signer);
    if (!await cweth.isOperator(address!, VEIL_ADDRESS)) await (await cweth.setOperator(VEIL_ADDRESS, Math.floor(Date.now()/1000)+31536000)).wait();
    setFheStep(2); log('Encrypting...');
    const { handle, proof } = await encrypt(wei, address!);
    setFheStep(3);
    const veil = new ethers.Contract(VEIL_ADDRESS, VEIL_ABI as any, signer);
    setFheStep(4);
    await (await veil.repay(handle, proof, wei)).wait();
    setRepayAmt('');
  });

  const handleClose = () => doTx('Close Position', async () => {
    const signer = await getSigner();
    const veil = new ethers.Contract(VEIL_ADDRESS, VEIL_ABI as any, signer);
    await (await veil.closePosition()).wait();
  });

  const handleFaucet = async () => {
    if (!address) return;
    setLoading(true); log('Requesting cWETH...');
    try {
      const res = await fetch(`${BACKEND}/faucet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address }) });
      const d = await res.json();
      if (d.success) { log('✅ 0.5 cWETH sent'); setCwethBalance(null); }
      else log(`❌ ${d.error}`);
    } catch { log('❌ Faucet failed'); }
    finally { setLoading(false); }
  };

  const switchToSepolia = async () => {
    try { await (window as any).ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] }); }
    catch(e: any) { if (e.code === 4902) await (window as any).ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0xaa36a7', chainName: 'Sepolia', rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'], nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 } }] }); }
  };

  const fmt = (v: bigint) => parseFloat(ethers.formatUnits(v, CWETH_DECIMALS)).toFixed(4);
  const usd = (v: bigint) => (parseFloat(ethers.formatUnits(v, CWETH_DECIMALS)) * ethPrice).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const collEth = position?.collateralPlain ? parseFloat(fmt(position.collateralPlain)) : 0;
  const debtEth = position?.debtPlain ? parseFloat(fmt(position.debtPlain)) : 0;
  const maxBorrow = (collEth * 0.66).toFixed(4);
  const liqPrice = debtEth > 0 && collEth > 0 ? ((debtEth * 1.5 / collEth) * ethPrice).toFixed(0) : null;
  const poolEth = stats?.pool ? parseFloat(ethers.formatUnits(stats.pool, CWETH_DECIMALS)).toFixed(2) : '0';

  const C = { bg: '#050506', surface: '#0d0d10', border: 'rgba(255,255,255,0.06)', text: '#f0f0f5', text2: '#7070a0', text3: '#303045', accent: '#f5c542', green: '#10b981', red: '#ef4444', teal: '#5eead4' };
  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 } as any;
  const inp = { width: '100%', background: C.bg, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 8, padding: '10px 14px', color: C.text, fontSize: 15, outline: 'none', marginBottom: 12, boxSizing: 'border-box' as any } as any;
  const btn = (bg: string, color = '#fff') => ({ width: '100%', padding: 12, borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 14, marginBottom: 8, background: bg, color } as any);
  const tabStyle = (active: boolean) => ({ padding: '8px 16px', background: active ? 'rgba(255,255,255,0.08)' : 'none', border: 'none', color: active ? C.text : C.text2, cursor: 'pointer', fontSize: 13, borderRadius: 6 } as any);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      {wrongNetwork && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: C.red, fontSize: 13 }}>⚠️ Wrong network — VEIL runs on Sepolia only</span>
          <button onClick={switchToSepolia} style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>Switch</button>
        </div>
      )}

      {fheStep > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>{fheAction} — Processing</div>
          {['Preparing', 'Encrypting with FHE', 'Sign transaction', 'Confirming on Sepolia'].map((s, i) => (
            <div key={i} style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 6, background: fheStep === i+1 ? 'rgba(245,197,66,0.05)' : fheStep > i+1 ? 'rgba(16,185,129,0.05)' : 'transparent', border: `1px solid ${fheStep === i+1 ? 'rgba(245,197,66,0.3)' : fheStep > i+1 ? 'rgba(16,185,129,0.3)' : C.border}`, color: fheStep === i+1 ? C.accent : fheStep > i+1 ? C.green : C.text3, display: 'flex', alignItems: 'center', gap: 8 }}>
              {fheStep > i+1 ? '✅' : fheStep === i+1 ? '⏳' : '⭕'} {s}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' as any, alignItems: 'center' }}>
        {['dashboard','deposit','borrow','repay','markets'].map(t => (
          <button key={t} style={tabStyle(activeTab === t)} onClick={() => setActiveTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: sdkReady ? C.green : C.text2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: sdkReady ? C.green : C.accent, display: 'inline-block' }} />
          {sdkLoading ? 'Loading SDK...' : sdkReady ? 'FHE SDK ready' : 'FHE backend ready'}
        </span>
      </div>

      {activeTab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { l: 'Collateral', v: position?.exists ? `${fmt(position.collateralPlain)} cWETH` : '—', s: position?.exists ? `$${usd(position.collateralPlain)}` : '', c: C.green },
              { l: 'Debt', v: position?.exists ? `${fmt(position.debtPlain)} cWETH` : '—', s: position?.exists ? `$${usd(position.debtPlain)}` : '', c: C.red },
              { l: 'Max Borrow', v: position?.exists ? `${maxBorrow} cWETH` : '—', s: '66% of collateral', c: C.accent },
              { l: 'Liq. Price', v: liqPrice ? `$${Number(liqPrice).toLocaleString()}` : '—', s: 'ETH at liquidation', c: C.red },
            ].map(m => (
              <div key={m.l} style={card}>
                <div style={{ fontSize: 11, color: C.text2, textTransform: 'uppercase' as any, letterSpacing: 1, marginBottom: 6 }}>{m.l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: m.c, marginBottom: 4 }}>{m.v}</div>
                <div style={{ fontSize: 11, color: C.text3 }}>{m.s}</div>
              </div>
            ))}
          </div>
          {!position?.exists ? (
            <div style={{ ...card, textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>No Open Position</div>
              <div style={{ color: C.text2, fontSize: 13, marginBottom: 20 }}>Deposit cWETH to open a confidential lending position.</div>
              <button style={{ ...btn(C.accent, '#050506'), width: 'auto', padding: '10px 24px', marginBottom: 0 }} onClick={() => setActiveTab('deposit')}>Deposit Collateral</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600 }}>Position Details</div>
                  <span style={{ fontSize: 11, color: C.green, background: 'rgba(16,185,129,0.1)', padding: '3px 8px', borderRadius: 4 }}>Active</span>
                </div>
                {[['Collateral', `${fmt(position.collateralPlain)} cWETH`, C.green], ['Debt', `${fmt(position.debtPlain)} cWETH`, C.red], ['Health Factor', 'Private (FHE)', C.teal], ['Opened', new Date(Number(position.openedAt)*1000).toLocaleDateString(), C.text]].map(([k,v,c]) => (
                  <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                    <span style={{ color: C.text2 }}>{k}</span><span style={{ color: c as string }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
                  <button style={{ ...btn(C.accent, '#050506'), marginBottom: 0 }} onClick={() => setActiveTab('deposit')}>Add Collateral</button>
                  <button style={{ ...btn(C.red), marginBottom: 0 }} onClick={handleClose} disabled={loading}>Close Position</button>
                </div>
              </div>
              <div style={card}>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>Transactions</div>
                {txLog.length === 0 ? <div style={{ color: C.text3, fontSize: 13, textAlign: 'center', padding: 16 }}>No transactions yet</div>
                  : txLog.map((t, i) => <div key={i} style={{ fontSize: 12, color: C.text2, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>{t}</div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'deposit' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>{position?.exists ? 'Add Collateral' : 'Open Position'}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text2, marginBottom: 8 }}>
              <span>Amount (cWETH)</span>
              <span>
                {cwethBalance !== null
                  ? <span style={{ color: C.accent }}>Balance: {cwethBalance} cWETH</span>
                  : <button onClick={showCwethBalance} disabled={balanceLoading || !sdkReady} style={{ background: 'none', border: 'none', color: sdkReady ? C.accent : C.text3, cursor: sdkReady ? 'pointer' : 'not-allowed', fontSize: 11, fontFamily: 'monospace' }}>
                      {balanceLoading ? 'Decrypting...' : sdkReady ? 'Show balance' : 'SDK loading...'}
                    </button>
                }
              </span>
            </div>
            <input style={inp} type="number" placeholder="0.0" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} />
            <button style={btn(C.accent, '#050506')} onClick={handleDeposit} disabled={loading}>
              {loading ? 'Processing...' : position?.exists ? 'Add Collateral' : 'Deposit & Open Position'}
            </button>
          </div>
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>Get cWETH</div>
            <div style={{ fontSize: 13, color: C.text2, marginBottom: 16, lineHeight: 1.6 }}>cWETH is Zama&apos;s confidential WETH on Sepolia. Use the faucet to get test tokens.</div>
            <button style={btn(C.accent, '#050506')} onClick={handleFaucet} disabled={loading}>{loading ? 'Requesting...' : 'Get 0.5 cWETH (Faucet)'}</button>
            <div style={{ fontSize: 11, color: C.text3, textAlign: 'center' }}>One drip per hour per address</div>
          </div>
        </div>
      )}

      {activeTab === 'borrow' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>Borrow cWETH</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 13 }}>
              <span style={{ color: C.text2 }}>Available to borrow</span><span style={{ color: C.green }}>{maxBorrow} cWETH</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 13 }}>
              <span style={{ color: C.text2 }}>Pool liquidity</span><span>{poolEth} cWETH</span>
            </div>
            <div style={{ fontSize: 12, color: C.text2, marginBottom: 8 }}>Amount (cWETH)</div>
            <input style={inp} type="number" placeholder="0.0" value={borrowAmt} onChange={e => setBorrowAmt(e.target.value)} />
            <button style={btn(C.accent, '#050506')} onClick={handleBorrow} disabled={loading}>{loading ? 'Processing...' : 'Borrow'}</button>
          </div>
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>How Borrowing Works</div>
            <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.8 }}>
              <div>Max LTV: <strong style={{ color: C.text }}>66% of collateral</strong></div>
              <div>Liquidation threshold: <strong style={{ color: C.text }}>150%</strong></div>
              <div>Liquidation bonus: <strong style={{ color: C.text }}>5%</strong></div>
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(94,234,212,0.05)', border: '1px solid rgba(94,234,212,0.15)', borderRadius: 8 }}>
                🔒 Health factor computed in FHE. Bots cannot read it.
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'repay' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>Repay Debt</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 13 }}>
              <span style={{ color: C.text2 }}>Outstanding debt</span>
              <span style={{ color: C.red }}>{position?.exists ? `${fmt(position.debtPlain)} cWETH` : '—'}</span>
            </div>
            <div style={{ fontSize: 12, color: C.text2, marginBottom: 8 }}>Amount (cWETH)</div>
            <input style={inp} type="number" placeholder="0.0" value={repayAmt} onChange={e => setRepayAmt(e.target.value)} />
            <button style={btn(C.green)} onClick={handleRepay} disabled={loading}>{loading ? 'Processing...' : 'Repay Debt'}</button>
          </div>
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Close Position</div>
            <div style={{ fontSize: 13, color: C.accent, background: 'rgba(245,197,66,0.05)', border: '1px solid rgba(245,197,66,0.15)', borderRadius: 8, padding: 10, marginBottom: 16 }}>⚠️ Repay all debt before closing.</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 13 }}>
              <span style={{ color: C.text2 }}>Collateral to return</span>
              <span style={{ color: C.green }}>{position?.exists ? `${fmt(position.collateralPlain)} cWETH` : '—'}</span>
            </div>
            <button style={btn(C.red)} onClick={handleClose} disabled={loading}>{loading ? 'Processing...' : 'Close Position'}</button>
          </div>
        </div>
      )}

      {activeTab === 'markets' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
            {[{l:'Pool Liquidity',v:`${poolEth} cWETH`,c:C.green},{l:'Open Positions',v:stats?.positions?.toString()||'—',c:C.text},{l:'ETH Price',v:`$${ethPrice.toLocaleString()}`,c:C.accent}].map(m => (
              <div key={m.l} style={card}>
                <div style={{ fontSize: 11, color: C.text2, textTransform: 'uppercase' as any, letterSpacing: 1, marginBottom: 6 }}>{m.l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: m.c }}>{m.v}</div>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Contracts</div>
            {[['VeilLending', VEIL_ADDRESS],['cWETHMock', CWETH_ADDRESS]].map(([n,a]) => (
              <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ color: C.text2 }}>{n}</span>
                <a href={`https://sepolia.etherscan.io/address/${a}`} target="_blank" rel="noreferrer" style={{ color: C.accent, fontFamily: 'monospace', fontSize: 11 }}>{a?.slice(0,6)}...{a?.slice(-4)} ↗</a>
              </div>
            ))}
          </div>
        </div>
      )}

      {txLog.length > 0 && activeTab !== 'dashboard' && (
        <div style={{ ...card, marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Recent</div>
          {txLog.map((t, i) => <div key={i} style={{ fontSize: 12, color: C.text2, padding: '4px 0' }}>{t}</div>)}
        </div>
      )}
    </div>
  );
}

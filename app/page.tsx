'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import dynamic from 'next/dynamic';

const Dashboard = dynamic(() => import('./components/Dashboard'), { ssr: false });

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <main style={{ minHeight: '100vh', background: '#050506', color: '#f0f0f5', fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'rgba(5,5,6,0.9)', backdropFilter: 'blur(20px)', zIndex: 100 }}>
        <div style={{ fontFamily: 'serif', fontSize: '22px' }}>VEIL<span style={{ color: '#f5c542' }}>.</span></div>
        <ConnectButton />
      </nav>
      {isConnected ? (
        <Dashboard />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', textAlign: 'center', padding: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔒</div>
          <h1 style={{ fontFamily: 'serif', fontSize: 'clamp(32px, 6vw, 64px)', fontWeight: 400, marginBottom: '16px', lineHeight: 1.1 }}>
            Lend Privately.<br /><span style={{ color: '#f5c542', fontStyle: 'italic' }}>Borrow Invisibly.</span>
          </h1>
          <p style={{ color: '#7070a0', fontSize: '16px', maxWidth: '480px', lineHeight: 1.7, marginBottom: '32px' }}>
            VEIL encrypts your position with FHE. Liquidation bots see only ciphertext — they can never calculate when to liquidate you.
          </p>
          <ConnectButton />
        </div>
      )}
    </main>
  );
}

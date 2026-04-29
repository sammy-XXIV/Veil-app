'use client';
import { useState, useEffect, useCallback } from 'react';
import { VEIL_ADDRESS } from '../lib/contract';

const BACKEND = 'https://veil-backend-2gki.onrender.com';

export function useFHE() {
  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND}/health`)
      .then(r => r.json())
      .then(d => { if (d.status === 'ok') setSdkReady(true); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const encrypt = useCallback(async (amount: bigint, userAddress: string): Promise<{ handle: string; proof: string }> => {
    const res = await fetch(`${BACKEND}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amount.toString(), contractAddress: VEIL_ADDRESS, userAddress }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return { handle: data.handle, proof: data.inputProof };
  }, []);

  const getUserBalance = useCallback(async (): Promise<bigint | null> => {
    return null;
  }, []);

  return { sdkReady, loading, encrypt, getUserBalance };
}

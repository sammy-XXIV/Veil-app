'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWalletClient } from 'wagmi';
import { VEIL_ADDRESS } from '../lib/contract';

export function useFHE() {
  const [instance, setInstance] = useState<any>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const { data: walletClient } = useWalletClient();

  useEffect(() => {
    async function init() {
      try {
        const { initSDK, createInstance } = await import('@zama-fhe/relayer-sdk');
        await initSDK();
        const fhevmInstance = await createInstance({
          aclContractAddress: '0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D',
          kmsContractAddress: '0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A',
          inputVerifierContractAddress: '0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0',
          verifyingContractAddressDecryption: '0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478',
          verifyingContractAddressInputVerification: '0x483b9dE06E4E4C7D35CCf5837A1668487406D955',
          chainId: 11155111,
          gatewayChainId: 10901,
          network: 'https://ethereum-sepolia-rpc.publicnode.com',
          relayerUrl: 'https://relayer.testnet.zama.org',
        });
        setInstance(fhevmInstance);
        setSdkReady(true);
        console.log('FHE SDK ready');
      } catch(e: any) {
        console.error('FHE SDK failed:', e.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const encrypt = useCallback(async (amount: bigint, userAddress: string): Promise<{ handle: string; proof: string }> => {
    // Try browser SDK first
    if (instance && sdkReady) {
      try {
        const input = instance.createEncryptedInput(VEIL_ADDRESS, userAddress);
        input.add64(amount);
        const encrypted = await input.encrypt();
        return {
          handle: encrypted.handles[0],
          proof: encrypted.inputProof,
        };
      } catch(e: any) {
        console.warn('Browser encrypt failed, using backend:', e.message);
      }
    }

    // Fallback to backend
    const res = await fetch('https://veil-backend-2gki.onrender.com/encrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amount.toString(),
        contractAddress: VEIL_ADDRESS,
        userAddress,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Encryption failed');
    return { handle: data.handle, proof: data.inputProof };
  }, [instance, sdkReady]);

  const getUserBalance = useCallback(async (
    handle: string,
    contractAddress: string,
    userAddress: string,
    signer: any
  ): Promise<bigint | null> => {
    if (!instance || !sdkReady) return null;
    try {
      const keypair = instance.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const eip712 = instance.createEIP712(
        keypair.publicKey,
        [contractAddress],
        startTimestamp,
        durationDays,
      );
      const signature = await signer.signTypedData({
        domain: eip712.domain,
        types: { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        primaryType: 'UserDecryptRequestVerification',
        message: eip712.message,
      });
      const result = await instance.userDecrypt(
        [{ handle, contractAddress }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        [contractAddress],
        userAddress,
        startTimestamp,
        durationDays,
      );
      return result[handle] as bigint;
    } catch(e: any) {
      console.error('User decrypt failed:', e.message);
      return null;
    }
  }, [instance, sdkReady]);

  return { instance, sdkReady, loading, encrypt, getUserBalance };
}

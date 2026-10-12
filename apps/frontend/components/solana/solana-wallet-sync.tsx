"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { API_BACKEND_URL } from "@/config";
import { useSolWallet } from "@/components/solana/wallet-provider";

/**
 * Registers the connected Solana wallet with the backend so a booking's host
 * (or guest) can be matched to the on-chain wallet that must sign escrow
 * transactions.
 *
 * Clerk authentication remains independent of the wallet address: the wallet is
 * stored on the same user profile but never replaces the Clerk identity.
 */
export function SolanaWalletSync() {
  const { getToken, isSignedIn } = useAuth();
  const { publicKey, connected } = useSolWallet();
  const syncedWallet = useRef<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !connected || !publicKey) {
      syncedWallet.current = null;
      return;
    }

    const address = publicKey.toBase58();

    // Avoid registering the same wallet repeatedly on re-renders.
    if (syncedWallet.current === address) return;

    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        await axios.post(
          `${API_BACKEND_URL}/api/v1/user/solana-wallet`,
          { solanaWalletAddress: address },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        syncedWallet.current = address;
        setSyncError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to register Solana wallet:", err);
        setSyncError(
          axios.isAxiosError(err) && err.response?.data?.error
            ? err.response.data.error
            : "Could not register your Solana wallet."
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected, getToken, isSignedIn, publicKey]);

  if (!syncError) return null;

  return (
    <p className="text-xs text-red-500 px-4" role="status">
      {syncError}
    </p>
  );
}

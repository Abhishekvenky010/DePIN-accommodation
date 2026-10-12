"use client";

import { PublicKey } from "@solana/web3.js";
import { getSolanaConnection } from "./anchor-client";
import { signEscrowAction, type EscrowAction, type SignableWallet } from "./escrow-actions";

export type { EscrowAction, SignableWallet } from "./escrow-actions";

export interface EscrowActionWallets {
  hostWallet?: string | null;
  guestWallet?: string | null;
}

export async function signBookingAction(
  bookingId: string,
  action: EscrowAction,
  signerPubkey: PublicKey,
  wallet: SignableWallet,
  wallets: EscrowActionWallets
): Promise<string> {
  const connection = getSolanaConnection();
  return signEscrowAction(
    connection,
    {
      bookingId,
      hostWallet: wallets.hostWallet,
      guestWallet: wallets.guestWallet,
      signer: signerPubkey.toBase58(),
    },
    action,
    signerPubkey,
    wallet
  );
}

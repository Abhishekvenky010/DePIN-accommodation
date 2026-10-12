"use client";

import { PublicKey, Transaction, type Connection } from "@solana/web3.js";
import {
  deriveEscrowPDA,
  buildHostAcceptIx,
  buildConfirmCompletionIx,
  buildRequestCancellationIx,
} from "./anchor-client";

export type EscrowAction = "accept" | "reject" | "cancel" | "complete";

export interface EscrowActionContext {
  bookingId: string;
  /** Wallet public key stored for the host user in the database. */
  hostWallet?: string | null;
  /** Wallet public key stored for the guest user in the database. */
  guestWallet?: string | null;
  /** Wallet address of the connected signer performing the action. */
  signer: string;
}

/**
 * Minimal shape of a wallet adapter that can sign and send a transaction.
 * `sendTransaction` is the portable method exposed by every wallet adapter.
 */
export interface SignableWallet {
  sendTransaction: (
    transaction: Transaction,
    connection: Connection
  ) => Promise<string>;
}

/**
 * Signs and submits the escrow instruction that performs a booking lifecycle
 * transition.
 *
 * - accept      -> host_accept
 * - reject      -> request_cancellation (host confirms, refunds guest)
 * - cancel      -> request_cancellation (either party confirms)
 * - complete    -> confirm_completion
 *
 * The on-chain program requires both parties to confirm a cancellation before
 * funds are refunded, and both parties to confirm completion before funds are
 * released to the host.
 */
export async function signEscrowAction(
  connection: Connection,
  context: EscrowActionContext,
  action: EscrowAction,
  signer: PublicKey,
  wallet: SignableWallet
): Promise<string> {
  if (!(action === "accept" || action === "reject" || action === "cancel" || action === "complete")) {
    throw new Error(`Unsupported escrow action: ${action}`);
  }

  const { bookingId, hostWallet, guestWallet } = context;

  const [escrowPda] = deriveEscrowPDA(bookingId);

  const resolveWallet = (value: string | null | undefined, label = "wallet") => {
    if (!value) {
      throw new Error(`Missing ${label} address for this booking.`);
    }
    try {
      return new PublicKey(value);
    } catch {
      throw new Error(`Invalid ${label} address configured for this booking.`);
    }
  };

  const host = resolveWallet(hostWallet ?? signer.toBase58(), "host");
  const guest = resolveWallet(guestWallet ?? signer.toBase58(), "guest");

  let instruction;

  switch (action) {
    case "accept":
      // host_accept only signs the host account.
      instruction = buildHostAcceptIx(escrowPda, host);
      break;
    case "reject":
    case "cancel":
      // request_cancellation requires guest and host accounts plus a signer.
      instruction = buildRequestCancellationIx(escrowPda, guest, host, signer);
      break;
    case "complete":
      // confirm_completion requires guest and host accounts plus a signer.
      instruction = buildConfirmCompletionIx(escrowPda, guest, host, signer);
      break;
    default:
      throw new Error(`Unhandled escrow action: ${action}`);
  }

  const tx = new Transaction().add(instruction as never);
  tx.feePayer = signer;

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  return wallet.sendTransaction(tx, connection);
}

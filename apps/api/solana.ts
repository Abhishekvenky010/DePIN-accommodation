import { Connection, PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "Aa9c2mKRb9VgZAR6GpgLA8ujRjuzUFLM7EYJQryjWJmH"
);
export const DEVNET_RPC_ENDPOINT =
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

const ESCROW_SEED_PREFIX = "escrow";

export function getSolanaConnection(): Connection {
  return new Connection(DEVNET_RPC_ENDPOINT, "confirmed");
}

export function deriveEscrowPDA(bookingId: string): PublicKey {
  const seeds = [
    Buffer.from(ESCROW_SEED_PREFIX, "utf8"),
    Buffer.from(bookingId, "utf8"),
  ];
  const [pda] = PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
  return pda;
}

export type EscrowStatusName =
  | "Funded"
  | "Accepted"
  | "Released"
  | "Refunded";

export interface OnChainEscrow {
  bookingId: string;
  guest: PublicKey;
  host: PublicKey;
  amount: number;
  status: EscrowStatusName;
  guestConfirmedCompletion: boolean;
  hostConfirmedCompletion: boolean;
  guestConfirmedCancellation: boolean;
  hostConfirmedCancellation: boolean;
  bump: number;
}

/**
 * Deserializes the escrow account written by the accommodation_escrow program.
 *
 * Layout after the 8 byte Anchor account discriminator:
 *   booking_id: String (4 byte LE length prefix + utf8 bytes)
 *   guest: Pubkey
 *   host: Pubkey
 *   amount: u64 (LE)
 *   status: enum u8
 *   guestConfirmedCompletion: bool
 *   hostConfirmedCompletion: bool
 *   guestConfirmedCancellation: bool
 *   hostConfirmedCancellation: bool
 *   bump: u8
 */
export function decodeEscrowAccount(data: Buffer): OnChainEscrow {
  const offset = 8;

  const bookingIdLength = data.readUInt32LE(offset);
  const bookingId = data
    .subarray(offset + 4, offset + 4 + bookingIdLength)
    .toString("utf8");

  let pos = offset + 4 + bookingIdLength;

  const guest = new PublicKey(data.subarray(pos, pos + 32));
  pos += 32;
  const host = new PublicKey(data.subarray(pos, pos + 32));
  pos += 32;
  const amount = Number(data.readBigUInt64LE(pos));
  pos += 8;
  const statusIndex = data.readUInt8(pos);
  pos += 1;
  const guestConfirmedCompletion = data.readUInt8(pos) === 1;
  pos += 1;
  const hostConfirmedCompletion = data.readUInt8(pos) === 1;
  pos += 1;
  const guestConfirmedCancellation = data.readUInt8(pos) === 1;
  pos += 1;
  const hostConfirmedCancellation = data.readUInt8(pos) === 1;
  pos += 1;
  const bump = data.readUInt8(pos);

  const statuses: EscrowStatusName[] = [
    "Funded",
    "Accepted",
    "Released",
    "Refunded",
  ];

  return {
    bookingId,
    guest,
    host,
    amount,
    status: statuses[statusIndex] ?? "Funded",
    guestConfirmedCompletion,
    hostConfirmedCompletion,
    guestConfirmedCancellation,
    hostConfirmedCancellation,
    bump,
  };
}

export async function fetchEscrowAccount(
  connection: Connection,
  bookingId: string
): Promise<OnChainEscrow | null> {
  const pda = deriveEscrowPDA(bookingId);
  const accountInfo = await connection.getAccountInfo(pda);

  if (!accountInfo || accountInfo.owner.toBase58() !== PROGRAM_ID.toBase58()) {
    return null;
  }

  return decodeEscrowAccount(accountInfo.data);
}

export type VerificationResult =
  | {
      verified: true;
      escrow: OnChainEscrow;
      confirmedAt: number | null;
    }
  | {
      verified: false;
      reason: string;
    };

export interface VerifyFundingOptions {
  /** The booking record this transaction must fund. */
  bookingId: string;
  /** Transaction signature reported by the client wallet. */
  signature: string;
  /** Expected escrow amount in lamports. */
  expectedAmountLamports?: number | null;
  /** Optional expected guest wallet (must match escrow.guest). */
  expectedGuest?: string | null;
  /** Optional expected host wallet (must match escrow.host). */
  expectedHost?: string | null;
}

/**
 * Verifies that a booking escrow is really funded on Solana Devnet.
 *
 * A booking is never marked as funded based only on the client claim: the
 * escrow account must exist, be owned by the program, hold the booking id the
 * booking record uses, and hold at least the expected amount.
 */
export async function verifyEscrowFunding(
  options: VerifyFundingOptions
): Promise<VerificationResult> {
  const { bookingId, signature, expectedAmountLamports, expectedGuest, expectedHost } = options;

  try {
    const connection = getSolanaConnection();

    const statusResponse = await connection.getSignatureStatus(signature);
    const status = statusResponse?.value;

    if (!status) {
      return {
        verified: false,
        reason:
          "Transaction was not found on Solana Devnet. Wait for confirmation and retry.",
      };
    }

    if (status.err) {
      return {
        verified: false,
        reason: "The reported Solana transaction failed on Devnet.",
      };
    }

    if (
      status.confirmationStatus !== "confirmed" &&
      status.confirmationStatus !== "finalized"
    ) {
      return {
        verified: false,
        reason: "The reported Solana transaction is still pending confirmation.",
      };
    }

    const transaction = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction) {
      return {
        verified: false,
        reason: "Transaction details could not be fetched from Devnet.",
      };
    }

    const escrowPda = deriveEscrowPDA(bookingId);

    // Confirm the transaction actually involved the program and the escrow account.
    const staticKeys = transaction.transaction.message.staticAccountKeys ?? [];
    const touchesEscrow = staticKeys.some((key) => key.equals(escrowPda));
    const involvesProgram = staticKeys.some((key) => key.equals(PROGRAM_ID));

    if (!touchesEscrow || !involvesProgram) {
      return {
        verified: false,
        reason:
          "The reported transaction does not create the escrow account for this booking.",
      };
    }

    const escrow = await fetchEscrowAccount(connection, bookingId);

    if (!escrow) {
      return {
        verified: false,
        reason: "Escrow account for this booking was not found on Devnet.",
      };
    }

    if (escrow.bookingId !== bookingId) {
      return {
        verified: false,
        reason: "Escrow account booking id does not match this booking.",
      };
    }

    if (
      expectedAmountLamports !== null &&
      expectedAmountLamports !== undefined &&
      escrow.amount < expectedAmountLamports
    ) {
      return {
        verified: false,
        reason: `Escrow amount ${escrow.amount} lamports is lower than expected ${expectedAmountLamports} lamports.`,
      };
    }

    if (expectedGuest && escrow.guest.toBase58() !== expectedGuest) {
      return {
        verified: false,
        reason: "Escrow guest wallet does not match the booking guest.",
      };
    }

    if (expectedHost && escrow.host.toBase58() !== expectedHost) {
      return {
        verified: false,
        reason: "Escrow host wallet does not match the booking host.",
      };
    }

    if (escrow.status !== "Funded") {
      return {
        verified: false,
        reason: `Escrow is in state ${escrow.status}, expected Funded.`,
      };
    }

    return {
      verified: true,
      escrow,
      confirmedAt: transaction.blockTime ? transaction.blockTime * 1000 : null,
    };
  } catch (error) {
    console.error("Error verifying escrow funding:", error);
    return {
      verified: false,
      reason: "Unable to verify the escrow funding on Solana Devnet.",
    };
  }
}

const LAMPORTS_PER_SOL = 1_000_000_000;

export function paiseToLamports(paise: number): number {
  // Approximation used by the frontend: 1 SOL = 100000 paise
  return paise * 10_000;
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

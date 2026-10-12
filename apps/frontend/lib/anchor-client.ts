"use client";

import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("Aa9c2mKRb9VgZAR6GpgLA8ujRjuzUFLM7EYJQryjWJmH");
export const SOLANA_NETWORK = "devnet";
export const RPC_ENDPOINT = "https://api.devnet.solana.com";

export function getSolanaConnection(): Connection {
  return new Connection(RPC_ENDPOINT, "confirmed");
}

export function deriveEscrowPDA(bookingId: string): [PublicKey, number] {
  const seeds = [Buffer.from("escrow", "utf8"), Buffer.from(bookingId, "utf8")];
  const [pda, bump] = PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
  return [pda, bump];
}

export type EscrowStatus = "Funded" | "Accepted" | "Released" | "Refunded";

export interface EscrowAccount {
  bookingId: string;
  guest: PublicKey;
  host: PublicKey;
  amount: number;
  status: EscrowStatus;
  guestConfirmedCompletion: boolean;
  hostConfirmedCompletion: boolean;
  guestConfirmedCancellation: boolean;
  hostConfirmedCancellation: boolean;
  bump: number;
}

export function buildCreateAndFundEscrowIx(
  bookingId: string,
  amount: number,
  escrowPda: PublicKey,
  guest: PublicKey,
  host: PublicKey
) {
  const discriminator = Buffer.from([
    143, 254, 15, 181, 252, 27, 188, 229
  ]);

  const bookingIdBuffer = Buffer.from(bookingId, "utf8");
  const bookingIdLenBuffer = Buffer.alloc(4);
  bookingIdLenBuffer.writeUInt32LE(bookingIdBuffer.length);

  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(BigInt(amount));

  const data = Buffer.concat([
    discriminator,
    bookingIdLenBuffer,
    bookingIdBuffer,
    amountBuffer
  ]);

  return {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: guest, isSigner: true, isWritable: true },
      { pubkey: host, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  };
}

export function buildHostAcceptIx(
  escrowPda: PublicKey,
  host: PublicKey
) {
  const discriminator = Buffer.from([
    216, 110, 192, 119, 238, 15, 228, 104
  ]);

  return {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: host, isSigner: true, isWritable: true },
    ],
    data: discriminator,
  };
}

export function buildConfirmCompletionIx(
  escrowPda: PublicKey,
  host: PublicKey,
  guest: PublicKey,
  signer: PublicKey
) {
  const discriminator = Buffer.from([
    187, 31, 6, 48, 117, 161, 2, 243
  ]);

  return {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: host, isSigner: false, isWritable: false },
      { pubkey: guest, isSigner: false, isWritable: false },
      { pubkey: signer, isSigner: true, isWritable: false },
    ],
    data: discriminator,
  };
}

export function buildRequestCancellationIx(
  escrowPda: PublicKey,
  guest: PublicKey,
  host: PublicKey,
  signer: PublicKey
) {
  const discriminator = Buffer.from([
    143, 22, 73, 35, 219, 217, 185, 212
  ]);

  return {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: guest, isSigner: false, isWritable: false },
      { pubkey: host, isSigner: false, isWritable: false },
      { pubkey: signer, isSigner: true, isWritable: false },
    ],
    data: discriminator,
  };
}

export async function fetchEscrowAccount(
  connection: Connection,
  bookingId: string
): Promise<EscrowAccount | null> {
  const [pda] = deriveEscrowPDA(bookingId);
  const accountInfo = await connection.getAccountInfo(pda);
  if (!accountInfo) return null;

  const data = accountInfo.data;
  const offset = 8;

  const bookingIdLen = data.readUInt32LE(offset);
  const bookingIdBytes = data.slice(offset + 4, offset + 4 + bookingIdLen);
  const parsedBookingId = bookingIdBytes.toString("utf8");
  let pos = offset + 4 + bookingIdLen;

  const guest = new PublicKey(data.slice(pos, pos + 32));
  pos += 32;
  const host = new PublicKey(data.slice(pos, pos + 32));
  pos += 32;
  const amount = Number(data.readBigUInt64LE(pos));
  pos += 8;
  const statusByte = data.readUInt8(pos);
  pos += 1;
  const status: EscrowStatus = ["Funded", "Accepted", "Released", "Refunded"][statusByte] as EscrowStatus;
  const guestConfirmedCompletion = data.readUInt8(pos) === 1;
  pos += 1;
  const hostConfirmedCompletion = data.readUInt8(pos) === 1;
  pos += 1;
  const guestConfirmedCancellation = data.readUInt8(pos) === 1;
  pos += 1;
  const hostConfirmedCancellation = data.readUInt8(pos) === 1;
  pos += 1;
  const bump = data.readUInt8(pos);

  return {
    bookingId: parsedBookingId,
    guest,
    host,
    amount,
    status,
    guestConfirmedCompletion,
    hostConfirmedCompletion,
    guestConfirmedCancellation,
    hostConfirmedCancellation,
    bump,
  };
}

export async function fetchEscrowTransactionSignatures(
  connection: Connection,
  pda: PublicKey,
  limit: number = 20
): Promise<string[]> {
  const signatures = await connection.getSignaturesForAddress(pda, { limit });
  return signatures.map(s => s.signature);
}

export async function confirmTransaction(
  connection: Connection,
  signature: string,
  timeoutMs: number = 60000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await connection.getSignatureStatus(signature);
    if (status?.value?.confirmationStatus === "confirmed" || status?.value?.confirmationStatus === "finalized") {
      return true;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

export function paiseToLamports(paise: number): number {
  // Approximate conversion: 1 SOL = 100000 paise, so 1 paise = 10000 lamports
  return paise * 10000;
}

export function lamportsToPaise(lamports: number): number {
  return Math.round(lamports / 10000);
}

export function formatPriceAsSOL(paise: number): string {
  const lamports = paiseToLamports(paise);
  const sol = lamports / LAMPORTS_PER_SOL;
  return sol.toFixed(4);
}

export function escrowStatusToBookingStatus(status: EscrowStatus): string {
  switch (status) {
    case "Funded": return "Pending";
    case "Accepted": return "Confirmed";
    case "Released": return "Completed";
    case "Refunded": return "Cancelled";
    default: return "Pending";
  }
}

export { getSolanaConnection as getConnection };
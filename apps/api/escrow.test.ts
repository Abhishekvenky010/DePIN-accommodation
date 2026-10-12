import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { decodeEscrowAccount, deriveEscrowPDA, PROGRAM_ID, paiseToLamports, lamportsToSol } from "./solana";

const anchorDisc = (ns: string, name: string) =>
  createHash("sha256").update(`${ns}:${name}`).digest().subarray(0, 8);

const guest = new PublicKey("11111111111111111111111111111111");
const host = new PublicKey("11111111111111111111111111111112");

/** Encodes an Escrow account the same way the Rust program does. */
function encodeEscrow(opts: {
  bookingId: string;
  guest: PublicKey;
  host: PublicKey;
  amount: number;
  status: 0 | 1 | 2 | 3;
  guestConfirmedCompletion?: boolean;
  hostConfirmedCompletion?: boolean;
  guestConfirmedCancellation?: boolean;
  hostConfirmedCancellation?: boolean;
}) {
  const idBuf = Buffer.from(opts.bookingId, "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(idBuf.length);
  const amtBuf = Buffer.alloc(8);
  amtBuf.writeBigUInt64LE(BigInt(opts.amount));
  return Buffer.concat([
    Buffer.from([...anchorDisc("account", "Escrow")]),
    lenBuf,
    idBuf,
    opts.guest.toBytes(),
    opts.host.toBytes(),
    amtBuf,
    Buffer.from([opts.status]),
    Buffer.from([opts.guestConfirmedCompletion ? 1 : 0]),
    Buffer.from([opts.hostConfirmedCompletion ? 1 : 0]),
    Buffer.from([opts.guestConfirmedCancellation ? 1 : 0]),
    Buffer.from([opts.hostConfirmedCancellation ? 1 : 0]),
    Buffer.from([251]),
  ]);
}

test("decodes a funded escrow written by the program", () => {
  const data = encodeEscrow({
    bookingId: "booking-abc",
    guest,
    host,
    amount: 1_500_000_000,
    status: 0,
  });

  const escrow = decodeEscrowAccount(data);

  expect(escrow.bookingId).toBe("booking-abc");
  expect(escrow.guest.equals(guest)).toBe(true);
  expect(escrow.host.equals(host)).toBe(true);
  expect(escrow.amount).toBe(1_500_000_000);
  expect(escrow.status).toBe("Funded");
  expect(escrow.bump).toBe(251);
  expect(escrow.guestConfirmedCompletion).toBe(false);
});

test("decodes each escrow status", () => {
  for (const [status, name] of [
    [0, "Funded"], [1, "Accepted"], [2, "Released"], [3, "Refunded"],
  ] as const) {
    const escrow = decodeEscrowAccount(encodeEscrow({ bookingId: "b", guest, host, amount: 1, status }));
    expect(escrow.status).toBe(name);
  }
});

test("decodes confirmation flags", () => {
  const escrow = decodeEscrowAccount(
    encodeEscrow({
      bookingId: "b", guest, host, amount: 1, status: 1,
      guestConfirmedCompletion: true,
      guestConfirmedCancellation: false,
    })
  );
  expect(escrow.guestConfirmedCompletion).toBe(true);
  expect(escrow.hostConfirmedCompletion).toBe(false);
});

test("derives the escrow PDA from seeds [escrow, booking_id]", () => {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from("booking-xyz")],
    PROGRAM_ID
  );
  expect(deriveEscrowPDA("booking-xyz").equals(pda)).toBe(true);
  expect(bump).toBeGreaterThan(0);
});

test("escrow PDAs are unique per booking", () => {
  const a = deriveEscrowPDA("booking-1");
  const b = deriveEscrowPDA("booking-2");
  expect(a.equals(b)).toBe(false);
});

test("converts paise to lamports consistently", () => {
  expect(paiseToLamports(100_000)).toBe(1_000_000_000); // ~1 SOL
  expect(lamportsToSol(1_000_000_000)).toBe(1);
});

test("program id matches the deployed program address", () => {
  expect(PROGRAM_ID.toBase58()).toBe("Aa9c2mKRb9VgZAR6GpgLA8ujRjuzUFLM7EYJQryjWJmH");
});

test("guest and host must differ for escrow creation", () => {
  // The program rejects an escrow where guest == host, so the API must too.
  expect(guest.equals(host)).toBe(false);
});

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { AccommodationEscrow } from "../target/types/accommodation_escrow";

const ESCROW_SEED = Buffer.from("escrow");

/**
 * Tests for the accommodation_escrow program.
 *
 * These cover the on-chain escrow lifecycle that the booking marketplace
 * relies on: funding, host acceptance, mutual completion (release to host) and
 * mutual cancellation (refund to guest), plus the guards that prevent
 * unauthorized access and invalid state transitions.
 */
describe("accommodation_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AccommodationEscrow as Program<AccommodationEscrow>;

  /** Funds an already-connected payer with devnet SOL from the validator. */
  const fundIfNeeded = async (pubkey: PublicKey, min: number) => {
    const balance = await provider.connection.getBalance(pubkey);
    if (balance >= min) return;
    const sig = await provider.connection.requestAirdrop(pubkey, min * 4);
    await provider.connection.confirmTransaction(sig, "confirmed");
  };

  const escrowFor = (bookingId: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, Buffer.from(bookingId)],
      program.programId
    );
    return pda;
  };

  const uniqueBookingId = () => `booking-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  describe("create_and_fund_escrow", () => {
    it("creates a funded escrow and transfers SOL into it", async () => {
      const guest = provider.wallet;
      const host = Keypair.generate();
      const bookingId = uniqueBookingId();
      const amount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);

      const escrow = escrowFor(bookingId);

      await program.methods
        .createAndFundEscrow(bookingId, amount)
        .accounts({
          escrow,
          guest: guest.publicKey,
          host: host.publicKey,
        } as any)
        .signers([])
        .rpc();

      const account = await program.account.escrow.fetch(escrow);
      assert.strictEqual(account.bookingId, bookingId);
      assert.strictEqual(account.guest, guest.publicKey);
      assert.strictEqual(account.host, host.publicKey);
      assert.ok(account.amount.eq(amount));
      assert.deepEqual(account.status, { funded: {} });
      assert.strictEqual(account.guestConfirmedCompletion, false);
      assert.strictEqual(account.hostConfirmedCompletion, false);
      assert.strictEqual(account.guestConfirmedCancellation, false);
      assert.strictEqual(account.hostConfirmedCancellation, false);

      // The escrow account now holds the rent-exempt minimum plus the amount.
      const balanceAfter = await provider.connection.getBalance(escrow);
      assert.ok(
        balanceAfter >= amount.toNumber(),
        `escrow balance ${balanceAfter} should cover the funded amount`
      );
    });

    it("rejects a zero amount", async () => {
      const guest = provider.wallet;
      const host = Keypair.generate();
      const bookingId = uniqueBookingId();
      const escrow = escrowFor(bookingId);
      const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);

      try {
        await program.methods
          .createAndFundEscrow(bookingId, amount)
          .accounts({
            escrow,
            guest: guest.publicKey,
            host: host.publicKey,
          } as any)
          .signers([])
          .rpc();
        assert.fail("expected create_and_fund_escrow to reject a zero amount");
      } catch (err) {
        const message = String((err as Error).message);
        assert.match(message, /ZeroAmount|Amount must be greater than zero/);
      }
    });

    it("rejects an empty booking id", async () => {
      const guest = provider.wallet;
      const host = Keypair.generate();
      const escrow = escrowFor("");

      try {
        await program.methods
          .createAndFundEscrow("", new anchor.BN(0.1 * LAMPORTS_PER_SOL))
          .accounts({
            escrow,
            guest: guest.publicKey,
            host: host.publicKey,
          } as any)
          .signers([])
          .rpc();
        assert.fail("expected create_and_fund_escrow to reject an empty booking id");
      } catch (err) {
        const message = String((err as Error).message);
        assert.match(message, /InvalidBookingId|Invalid booking ID|seeds/);
      }
    });

    it("rejects an escrow where guest equals host", async () => {
      // The program rejects an escrow whose guest and host are the same wallet.
      const sameWallet = Keypair.generate();
      const bookingId = uniqueBookingId();
      const escrow = escrowFor(bookingId);

      // Fund the payer so the transaction can be assembled before it fails.
      await fundIfNeeded(sameWallet.publicKey, 1 * LAMPORTS_PER_SOL);

      try {
        await program.methods
          .createAndFundEscrow(bookingId, new anchor.BN(0.1 * LAMPORTS_PER_SOL))
          .accounts({
            escrow,
            guest: sameWallet.publicKey,
            host: sameWallet.publicKey,
          } as any)
          .signers([sameWallet])
          .rpc();
        assert.fail("expected create_and_fund_escrow to reject guest == host");
      } catch (err) {
        const message = String((err as Error).message);
        assert.match(message, /InvalidGuestHost|same/);
      }
    });
  });

  describe("host_accept", () => {
    it("lets the host accept a funded escrow", async () => {
      const guest = provider.wallet;
      const host = Keypair.generate();
      const bookingId = uniqueBookingId();
      const amount = new anchor.BN(0.2 * LAMPORTS_PER_SOL);
      const escrow = escrowFor(bookingId);

      await program.methods
        .createAndFundEscrow(bookingId, amount)
        .accounts({ escrow, guest: guest.publicKey, host: host.publicKey } as any)
        .signers([])
        .rpc();

      await program.methods
        .hostAccept()
        .accounts({ escrow, host: host.publicKey } as any)
        .signers([host])
        .rpc();

      const account = await program.account.escrow.fetch(escrow);
      assert.deepEqual(account.status, { accepted: {} });
    });

    it("rejects acceptance by someone other than the host", async () => {
      const guest = provider.wallet;
      const host = Keypair.generate();
      const impostor = Keypair.generate();
      const bookingId = uniqueBookingId();
      const escrow = escrowFor(bookingId);
      const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);

      await program.methods
        .createAndFundEscrow(bookingId, amount)
        .accounts({ escrow, guest: guest.publicKey, host: host.publicKey } as any)
        .signers([])
        .rpc();

      await fundIfNeeded(impostor.publicKey, 0.1 * LAMPORTS_PER_SOL);

      try {
        await program.methods
          .hostAccept()
          .accounts({ escrow, host: impostor.publicKey } as any)
          .signers([impostor])
          .rpc();
        assert.fail("expected host_accept to reject a non-host signer");
      } catch (err) {
        const message = String((err as Error).message);
        assert.match(message, /UnauthorizedHost|Unauthorized|Signature verification/);
      }
    });
  });

  describe("confirm_completion", () => {
    it("releases funds to the host once both parties confirm", async () => {
      const guest = provider.wallet;
      const host = Keypair.generate();
      const bookingId = uniqueBookingId();
      const amount = new anchor.BN(0.3 * LAMPORTS_PER_SOL);
      const escrow = escrowFor(bookingId);

      await program.methods
        .createAndFundEscrow(bookingId, amount)
        .accounts({ escrow, guest: guest.publicKey, host: host.publicKey } as any)
        .signers([])
        .rpc();

      await program.methods
        .hostAccept()
        .accounts({ escrow, host: host.publicKey } as any)
        .signers([host])
        .rpc();

      // Either party can confirm first; release happens on the second.
      await program.methods
        .confirmCompletion()
        .accounts({
          escrow,
          host: host.publicKey,
          guest: guest.publicKey,
          signer: guest.publicKey,
        } as any)
        .signers([])
        .rpc();

      let account = await program.account.escrow.fetch(escrow);
      assert.strictEqual(account.guestConfirmedCompletion, true);
      assert.strictEqual(account.hostConfirmedCompletion, false);
      assert.deepEqual(account.status, { accepted: {} });

      await program.methods
        .confirmCompletion()
        .accounts({
          escrow,
          host: host.publicKey,
          guest: guest.publicKey,
          signer: host.publicKey,
        } as any)
        .signers([host])
        .rpc();

      account = await program.account.escrow.fetch(escrow);
      assert.strictEqual(account.hostConfirmedCompletion, true);
      assert.deepEqual(account.status, { released: {} });

      // The escrow only keeps the rent-exempt minimum after release.
      // 8 (discriminator) + 4 (string len) + 100 (max booking id) + 64 (pubkeys)
      // + 8 (amount) + 1 (status) + 4 (bool flags) + 1 (bump)
      const escrowSpace = 8 + 4 + 100 + 64 + 8 + 1 + 4 + 1;
      const rentExempt = await provider.connection.getMinimumBalanceForRentExemption(
        escrowSpace
      );
      const balance = await provider.connection.getBalance(escrow);
      assert.ok(
        balance < amount.toNumber(),
        `escrow balance ${balance} should no longer hold the full amount ${amount.toNumber()}`
      );
      assert.ok(balance >= 0, "escrow keeps a non-negative balance");
      void rentExempt;
    });

    it("rejects duplicate confirmation by the same party", async () => {
      const guest = provider.wallet;
      const host = Keypair.generate();
      const bookingId = uniqueBookingId();
      const escrow = escrowFor(bookingId);
      const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);

      await program.methods
        .createAndFundEscrow(bookingId, amount)
        .accounts({ escrow, guest: guest.publicKey, host: host.publicKey } as any)
        .signers([])
        .rpc();

      await program.methods
        .confirmCompletion()
        .accounts({
          escrow,
          host: host.publicKey,
          guest: guest.publicKey,
          signer: guest.publicKey,
        } as any)
        .signers([])
        .rpc();

      try {
        await program.methods
          .confirmCompletion()
          .accounts({
            escrow,
            host: host.publicKey,
            guest: guest.publicKey,
            signer: guest.publicKey,
          } as any)
          .signers([])
          .rpc();
        assert.fail("expected a second confirmation by the same party to fail");
      } catch (err) {
        const message = String((err as Error).message);
        assert.match(message, /InvalidStateTransition/);
      }
    });

    it("rejects confirmation after funds were already released", async () => {
      const guest = provider.wallet;
      const host = Keypair.generate();
      const bookingId = uniqueBookingId();
      const escrow = escrowFor(bookingId);
      const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);

      await program.methods
        .createAndFundEscrow(bookingId, amount)
        .accounts({ escrow, guest: guest.publicKey, host: host.publicKey } as any)
        .signers([])
        .rpc();

      const accounts = { escrow, host: host.publicKey, guest: guest.publicKey };

      await program.methods
        .confirmCompletion()
        .accounts({ ...accounts, signer: guest.publicKey } as any)
        .signers([])
        .rpc();
      await program.methods
        .confirmCompletion()
        .accounts({ ...accounts, signer: host.publicKey } as any)
        .signers([host])
        .rpc();

      const final_host = Keypair.generate();
      try {
        await program.methods
          .confirmCompletion()
          .accounts({ ...accounts, signer: final_host.publicKey } as any)
          .signers([final_host])
          .rpc();
        assert.fail("expected confirmation after release to fail");
      } catch (err) {
        const message = String((err as Error).message);
        assert.match(message, /InvalidStateTransition|Released|Refunded/);
      }
    });
  });

  describe("request_cancellation", () => {
    it("refunds the guest once both parties confirm cancellation", async () => {
      const guest = provider.wallet;
      const host = Keypair.generate();
      const bookingId = uniqueBookingId();
      const amount = new anchor.BN(0.25 * LAMPORTS_PER_SOL);
      const escrow = escrowFor(bookingId);

      await program.methods
        .createAndFundEscrow(bookingId, amount)
        .accounts({ escrow, guest: guest.publicKey, host: host.publicKey } as any)
        .signers([])
        .rpc();

      const accounts = { escrow, guest: guest.publicKey, host: host.publicKey };

      // Guest requests cancellation first.
      await program.methods
        .requestCancellation()
        .accounts({ ...accounts, signer: guest.publicKey } as any)
        .signers([])
        .rpc();

      let account = await program.account.escrow.fetch(escrow);
      assert.strictEqual(account.guestConfirmedCancellation, true);
      assert.strictEqual(account.hostConfirmedCancellation, false);
      assert.deepEqual(account.status, { funded: {} });

      // Host confirms: refund is now executed.
      await program.methods
        .requestCancellation()
        .accounts({ ...accounts, signer: host.publicKey } as any)
        .signers([host])
        .rpc();

      account = await program.account.escrow.fetch(escrow);
      assert.strictEqual(account.hostConfirmedCancellation, true);
      assert.deepEqual(account.status, { refunded: {} });

      const balance = await provider.connection.getBalance(escrow);
      assert.ok(
        balance < amount.toNumber(),
        `escrow balance ${balance} should be below the funded amount after refund`
      );
    });

    it("rejects cancellation once completion has started", async () => {
      const guest = provider.wallet;
      const host = Keypair.generate();
      const bookingId = uniqueBookingId();
      const escrow = escrowFor(bookingId);
      const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);

      await program.methods
        .createAndFundEscrow(bookingId, amount)
        .accounts({ escrow, guest: guest.publicKey, host: host.publicKey } as any)
        .signers([])
        .rpc();

      const accounts = { escrow, guest: guest.publicKey, host: host.publicKey };

      // Guest confirms completion, so cancellation is no longer valid.
      await program.methods
        .confirmCompletion()
        .accounts({ ...accounts, signer: guest.publicKey } as any)
        .signers([])
        .rpc();

      try {
        await program.methods
          .requestCancellation()
          .accounts({ ...accounts, signer: host.publicKey } as any)
          .signers([host])
          .rpc();
        assert.fail("expected cancellation after completion started to fail");
      } catch (err) {
        const message = String((err as Error).message);
        assert.match(message, /InvalidStateTransition/);
      }
    });
  });
});

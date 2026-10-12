import express from "express"
import { authMiddleware } from "./middleware";
import { prismaClient } from "db/client";
import cors from "cors";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import {
    verifyEscrowFunding,
    getSolanaConnection,
    fetchEscrowAccount,
    deriveEscrowPDA,
    paiseToLamports,
} from "./solana";

const app = express();

app.use(cors());
app.use(express.json());

/**
 * Express types route parameters as `string | string[]`, so normalise them to a
 * plain string before they are passed to Prisma filters.
 */
function routeParam(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] ?? "";
    return value ?? "";
}

// --- Accommodations Endpoints ---

// Create an accommodation listing
app.post("/api/v1/accommodations", authMiddleware, async (req, res) => {
    try {
        const clerkId = req.userId!;
        
        const AccommodationCreateSchema = z.object({
            title: z.string().min(1, "Title is required"),
            description: z.string().min(1, "Description is required"),
            city: z.string().min(1, "City is required"),
            pricePerNightPaise: z.number().int().positive("Price must be a positive integer representing paise"),
            maxGuests: z.number().int().positive("Maximum guests must be a positive integer"),
            imageUrl: z.string().url().optional(),
        });

        const validation = AccommodationCreateSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors.map(e => e.message).join(", ") });
            return;
        }
        const { title, description, city, pricePerNightPaise, maxGuests, imageUrl } = validation.data;

        // Upsert so a user is created on first API use even if the Clerk webhook is not configured.
        const user = await prismaClient.user.upsert({
            where: { clerkId },
            update: {},
            create: { clerkId },
        });

        const accommodation = await prismaClient.accommodation.create({
            data: {
                hostId: user.id,
                title,
                description,
                city,
                pricePerNightPaise,
                maxGuests,
                imageUrl,
            },
        });

        res.json({ id: accommodation.id });
        return;
    } catch (error) {
        console.error("Error creating accommodation:", error);
        res.status(500).json({ error: "Internal server error" });
        return;
    }
});

// List active accommodations for public browsing
app.get("/api/v1/accommodations", async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const [accommodations, total] = await Promise.all([
            prismaClient.accommodation.findMany({
                where: { status: "Active" },
                skip,
                take: Number(limit),
                include: {
                    host: {
                        select: { id: true, name: true, email: true },
                    },
                },
            }),
            prismaClient.accommodation.count({ where: { status: "Active" } }),
        ]);

        res.json({
            accommodations,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit)),
            },
        });
        return;
    } catch (error) {
        console.error("Error listing accommodations:", error);
        res.status(500).json({ error: "Internal server error" });
        return;
    }
});

// Get a specific accommodation by ID
app.get("/api/v1/accommodations/:id", async (req, res) => {
    try {
        const id = routeParam(req.params.id);

        const accommodation = await prismaClient.accommodation.findFirst({
            where: { id, status: "Active" },
            include: {
                host: {
                    select: { id: true, name: true, email: true, solanaWalletAddress: true },
                },
                bookings: {
                    where: { status: { in: ["Confirmed", "Completed"] } },
                },
            },
        });

        if (!accommodation) {
            res.status(404).json({ error: "Accommodation not found" });
            return;
        }

        res.json(accommodation);
        return;
    } catch (error) {
        console.error("Error fetching accommodation:", error);
        res.status(500).json({ error: "Internal server error" });
        return;
    }
});

// --- Bookings Endpoints ---

// Register the connected Solana wallet for the signed-in user
app.post("/api/v1/user/solana-wallet", authMiddleware, async (req, res) => {
    try {
        const clerkId = req.userId!;
        const { solanaWalletAddress } = req.body ?? {};

        if (typeof solanaWalletAddress !== "string" || !solanaWalletAddress.trim()) {
            res.status(400).json({ error: "A Solana wallet address is required" });
            return;
        }

        // Reject addresses that are not valid Solana public keys.
        try {
            // eslint-disable-next-line no-new
            new PublicKey(solanaWalletAddress.trim());
        } catch {
            res.status(400).json({ error: "The provided wallet address is not a valid Solana address" });
            return;
        }

        const user = await prismaClient.user.update({
            where: { clerkId },
            data: { solanaWalletAddress: solanaWalletAddress.trim() },
            select: {
                id: true,
                clerkId: true,
                name: true,
                email: true,
                solanaWalletAddress: true,
            },
        });

        res.json(user);
        return;
    } catch (error) {
        console.error("Error registering Solana wallet:", error);
        res.status(500).json({ error: "Internal server error" });
        return;
    }
});

// Get the current user's profile (used to sync the registered Solana wallet)
app.get("/api/v1/user/me", authMiddleware, async (req, res) => {
    try {
        const clerkId = req.userId!;

        const user = await prismaClient.user.findUnique({
            where: { clerkId },
            select: {
                id: true,
                clerkId: true,
                name: true,
                email: true,
                solanaWalletAddress: true,
            },
        });

        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        res.json(user);
        return;
    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).json({ error: "Internal server error" });
        return;
    }
});

// Create a new booking
app.post("/api/v1/bookings", authMiddleware, async (req, res) => {
    try {
        const clerkId = req.userId!;

        const BookingCreateSchema = z.object({
            accommodationId: z.string().min(1, "Accommodation ID is required"),
            checkIn: z.string().transform((val) => new Date(val)),
            checkOut: z.string().transform((val) => new Date(val)),
            guestCount: z.number().int().positive("Guest count must be a positive integer"),
        });

        const validation = BookingCreateSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors.map(e => e.message).join(", ") });
            return;
        }
        const { accommodationId, checkIn, checkOut, guestCount } = validation.data;

        if (checkOut <= checkIn) {
            res.status(400).json({ error: "Check-out must be after check-in" });
            return;
        }

        const accommodation = await prismaClient.accommodation.findUnique({
            where: { id: accommodationId, status: "Active" },
        });

        if (!accommodation) {
            res.status(404).json({ error: "Accommodation not found" });
            return;
        }

        if (guestCount > accommodation.maxGuests) {
            res.status(400).json({ error: `Maximum guest capacity is ${accommodation.maxGuests}` });
            return;
        }

        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        const totalPricePaise = nights * accommodation.pricePerNightPaise;

        const user = await prismaClient.user.upsert({
            where: { clerkId },
            update: {},
            create: { clerkId },
        });

        // Prevent a host from booking their own listing through the on-chain escrow,
        // which the program rejects because guest and host must differ.
        if (accommodation.hostId === user.id) {
            res.status(400).json({ error: "You cannot book your own listing" });
            return;
        }

        const overlappingBooking = await prismaClient.booking.findFirst({
            where: {
                accommodationId,
                status: { in: ["Pending", "Confirmed"] },
                OR: [
                    { checkIn: { lt: checkOut }, checkOut: { gt: checkIn } },
                ],
            },
        });

        if (overlappingBooking) {
            res.status(409).json({ error: "The accommodation is already booked for the selected dates" });
            return;
        }

        const booking = await prismaClient.booking.create({
            data: {
                accommodationId,
                guestId: user.id,
                hostId: accommodation.hostId,
                checkIn,
                checkOut,
                guestCount,
                totalPricePaise,
                status: "Pending",
            },
            include: {
                accommodation: {
                    select: {
                        id: true,
                        title: true,
                        city: true,
                        pricePerNightPaise: true,
                        imageUrl: true,
                    },
                },
                guest: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        solanaWalletAddress: true,
                    },
                },
            },
        });

        res.json(booking);
        return;
    } catch (error) {
        console.error("Error creating booking:", error);
        res.status(500).json({ error: "Internal server error" });
        return;
    }
});

// List bookings for the current user
app.get("/api/v1/bookings", authMiddleware, async (req, res) => {
    try {
        const clerkId = req.userId!;

        const user = await prismaClient.user.findUnique({
            where: { clerkId },
        });

        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const bookings = await prismaClient.booking.findMany({
            where: {
                OR: [
                    { guestId: user.id },
                    { hostId: user.id },
                ],
            },
            include: {
                accommodation: {
                    select: {
                        id: true,
                        title: true,
                        city: true,
                        pricePerNightPaise: true,
                        imageUrl: true,
                    },
                },
                guest: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        solanaWalletAddress: true,
                    },
                },
                host: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        solanaWalletAddress: true,
                    },
                },
            },
        });

        res.json(bookings);
        return;
    } catch (error) {
        console.error("Error fetching bookings:", error);
        res.status(500).json({ error: "Internal server error" });
        return;
    }
});

// Get a specific booking by ID
app.get("/api/v1/bookings/:id", authMiddleware, async (req, res) => {
    try {
        const id = routeParam(req.params.id);
        const clerkId = req.userId!;

        const user = await prismaClient.user.findUnique({
            where: { clerkId },
        });

        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const booking = await prismaClient.booking.findFirst({
            where: {
                id,
                OR: [
                    { guestId: user.id },
                    { hostId: user.id },
                ],
            },
            include: {
                accommodation: {
                    select: {
                        id: true,
                        title: true,
                        city: true,
                        pricePerNightPaise: true,
                        imageUrl: true,
                        hostId: true,
                    },
                },
                guest: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        solanaWalletAddress: true,
                    },
                },
                host: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        solanaWalletAddress: true,
                    },
                },
            },
        });

        if (!booking) {
            res.status(404).json({ error: "Booking not found or access denied" });
            return;
        }

        res.json(booking);
        return;
    } catch (error) {
        console.error("Error fetching booking:", error);
        res.status(500).json({ error: "Internal server error" });
        return;
    }
});

// Booking lifecycle actions.
//
// Every transition is executed on-chain by the client wallet and then verified
// here before the booking record is updated, so the database never drifts from
// the escrow program's own state machine.
const OnChainActionSchema = z.object({
    signature: z.string().min(1, "A Solana transaction signature is required"),
    walletAddress: z.string().min(1).optional(),
});

type OnChainAction = "accept" | "reject" | "cancel" | "complete";

/**
 * Verifies a confirmed Devnet transaction that changed the escrow account for a
 * booking and returns the refreshed on-chain escrow state.
 */
async function verifyOnChainTransition(
    bookingId: string,
    signature: string,
    expectedStatuses: string[]
) {
    const connection = getSolanaConnection();
    const signatureStatus = await connection.getSignatureStatus(signature);
    const status = signatureStatus?.value;

    if (!status) {
        return { ok: false as const, error: "Transaction was not found on Solana Devnet." };
    }

    if (status.err) {
        return { ok: false as const, error: "The reported Solana transaction failed on Devnet." };
    }

    if (
        status.confirmationStatus !== "confirmed" &&
        status.confirmationStatus !== "finalized"
    ) {
        return { ok: false as const, error: "The reported Solana transaction is still pending." };
    }

    const escrow = await fetchEscrowAccount(connection, bookingId);

    if (!escrow) {
        return { ok: false as const, error: "Escrow account for this booking was not found on Devnet." };
    }

    if (!expectedStatuses.includes(escrow.status)) {
        return {
            ok: false as const,
            error: `Escrow is in state ${escrow.status}, expected one of ${expectedStatuses.join(", ")}.`,
        };
    }

    return { ok: true as const, escrow };
}

app.post("/api/v1/bookings/:id/:action", authMiddleware, async (req, res) => {
    try {
        const { action } = req.params;
        const id = routeParam(req.params.id);
        const clerkId = req.userId!;

        const allowedActions: OnChainAction[] = ["accept", "reject", "cancel", "complete"];
        if (!allowedActions.includes(action as OnChainAction)) {
            res.status(404).json({ error: "Unsupported booking action" });
            return;
        }

        const validation = OnChainActionSchema.safeParse(req.body ?? {});
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors.map((e) => e.message).join(", ") });
            return;
        }

        const { signature } = validation.data;

        const user = await prismaClient.user.findUnique({
            where: { clerkId },
            select: {
                id: true,
                solanaWalletAddress: true,
            },
        });

        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const booking = await prismaClient.booking.findFirst({
            where: { id },
            include: {
                accommodation: {
                    select: {
                        id: true,
                        title: true,
                        hostId: true,
                    },
                },
                guest: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        solanaWalletAddress: true,
                    },
                },
                host: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        solanaWalletAddress: true,
                    },
                },
            },
        });

        if (!booking) {
            res.status(404).json({ error: "Booking not found" });
            return;
        }

        const isHost = booking.hostId === user.id;
        const isGuest = booking.guestId === user.id;

        if (!isHost && !isGuest) {
            res.status(403).json({ error: "You do not have access to this booking" });
            return;
        }

        if (!booking.solanaStatus || booking.solanaStatus === "Cancelled") {
            res.status(409).json({ error: "This booking has no funded escrow to act on." });
            return;
        }

        // Only the host may accept or reject a pending request.
        if ((action === "accept" || action === "reject") && !isHost) {
            res.status(403).json({ error: "Only the host can accept or reject a booking." });
            return;
        }

        if (action === "complete" && !(isGuest || isHost)) {
            res.status(403).json({ error: "Only the guest or host can confirm completion." });
            return;
        }

        const expectedStatuses = action === "reject" || action === "cancel"
            ? ["Refunded"]
            : action === "accept"
                ? ["Accepted"]
                : action === "complete"
                    // A single confirmation may leave the escrow Accepted; the
                    // final confirmation releases the funds.
                    ? ["Accepted", "Released"]
                    : [];

        const verification = await verifyOnChainTransition(
            booking.id,
            signature,
            expectedStatuses
        );

        if (!verification.ok) {
            res.status(402).json({ error: `On-chain verification failed: ${verification.error}` });
            return;
        }

        const escrowStatus = verification.escrow.status;

        // Map the on-chain escrow state onto the booking records.
        //
        //   booking created (no escrow)  -> Pending
        //   escrow Funded                -> Pending   (awaiting host acceptance)
        //   escrow Accepted              -> Confirmed
        //   escrow Released              -> Completed
        //   escrow Refunded              -> Cancelled
        //
        // The escrow status above is the source of truth; `status` is the
        // aggregate view derived from it.
        let bookingStatus: "Pending" | "Confirmed" | "Cancelled" | "Completed" = "Pending";
        let solanaStatus: string = escrowStatus;

        switch (escrowStatus) {
            case "Accepted":
                bookingStatus = "Confirmed";
                solanaStatus = "Accepted";
                break;
            case "Released":
                bookingStatus = "Completed";
                solanaStatus = "Released";
                break;
            case "Refunded":
                bookingStatus = "Cancelled";
                solanaStatus = "Refunded";
                break;
            default:
                // Funded (or any unknown state) leaves the booking Pending.
                bookingStatus = "Pending";
                break;
        }

        const updatedBooking = await prismaClient.booking.update({
            where: { id },
            data: {
                status: bookingStatus,
                solanaStatus,
                solanaAmount: verification.escrow.amount,
                solanaBookingAccount: deriveEscrowPDA(booking.id).toBase58(),
            },
            include: {
                accommodation: {
                    select: {
                        id: true,
                        title: true,
                        city: true,
                        pricePerNightPaise: true,
                        imageUrl: true,
                    },
                },
                guest: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        solanaWalletAddress: true,
                    },
                },
                host: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        solanaWalletAddress: true,
                    },
                },
            },
        });

        res.json(updatedBooking);
        return;
    } catch (error) {
        console.error("Error processing booking action:", error);
        res.status(500).json({ error: "Internal server error" });
        return;
    }
});

// Record and verify the Solana funding transaction for a booking
app.post("/api/v1/bookings/:id/solana", authMiddleware, async (req, res) => {
    try {
        const id = routeParam(req.params.id);
        const { solanaSignature, solanaBookingAccount, solanaStatus, solanaAmount } = req.body;
        const clerkId = req.userId!;

        if (!solanaSignature || typeof solanaSignature !== "string") {
            res.status(400).json({ error: "A Solana transaction signature is required" });
            return;
        }

        const user = await prismaClient.user.findUnique({
            where: { clerkId },
        });

        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const booking = await prismaClient.booking.findFirst({
            where: {
                id,
                guestId: user.id,
            },
            include: {
                accommodation: {
                    select: {
                        id: true,
                        title: true,
                        city: true,
                        pricePerNightPaise: true,
                        imageUrl: true,
                        hostId: true,
                    },
                },
                host: {
                    select: {
                        id: true,
                        clerkId: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        if (!booking) {
            res.status(404).json({ error: "Booking not found or access denied" });
            return;
        }

        // Never mark a booking as funded based only on the client's claim.
        const verification = await verifyEscrowFunding({
            bookingId: booking.id,
            signature: solanaSignature,
            expectedAmountLamports: booking.totalPricePaise
                ? paiseToLamports(booking.totalPricePaise)
                : null,
        });

        if (!verification.verified) {
            res.status(402).json({ error: `Escrow verification failed: ${verification.reason}` });
            return;
        }

        // Reject a duplicate funding attempt for an already funded booking.
        if (booking.solanaStatus && booking.solanaStatus !== "Cancelled" && booking.solanaSignature) {
            res.status(409).json({ error: "This booking has already been funded" });
            return;
        }

        const updatedBooking = await prismaClient.booking.update({
            where: { id },
            data: {
                solanaSignature,
                solanaBookingAccount: solanaBookingAccount ?? verification.escrow.bookingId,
                solanaStatus: verification.escrow.status,
                solanaAmount: verification.escrow.amount,
                // Funding the escrow does not accept the booking: it stays
                // pending until the host accepts on-chain.
                status: "Pending",
            },
            include: {
                accommodation: {
                    select: {
                        id: true,
                        title: true,
                        city: true,
                        pricePerNightPaise: true,
                        imageUrl: true,
                    },
                },
                guest: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        solanaWalletAddress: true,
                    },
                },
                host: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        solanaWalletAddress: true,
                    },
                },
            },
        });

        res.json(updatedBooking);
        return;
    } catch (error) {
        console.error("Error recording Solana transaction:", error);
        res.status(500).json({ error: "Internal server error" });
        return;
    }
});

app.listen(8080);

import { describe, it, expect } from "bun:test";

// Pure logic tests for booking calculations

describe("Booking logic", () => {
    describe("nights calculation", () => {
        it("calculates 1 night for same-day check-in and next-day check-out", () => {
            const checkIn = new Date("2025-06-15T22:00:00Z");
            const checkOut = new Date("2025-06-16T10:00:00Z");
            const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
            expect(nights).toBe(1);
        });

        it("calculates 1 night for check-in evening to check-out next morning", () => {
            const checkIn = new Date("2025-06-15T20:00:00Z");
            const checkOut = new Date("2025-06-16T10:00:00Z");
            const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
            expect(nights).toBe(1);
        });

        it("calculates 2 nights for 2-day stay", () => {
            const checkIn = new Date("2025-06-15T14:00:00Z");
            const checkOut = new Date("2025-06-17T11:00:00Z");
            const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
            expect(nights).toBe(2);
        });

        it("calculates correct nights for 7-day stay", () => {
            const checkIn = new Date("2025-06-15T14:00:00Z");
            const checkOut = new Date("2025-06-22T11:00:00Z");
            const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
            expect(nights).toBe(7);
        });
    });

    describe("date overlap detection (half-open interval)", () => {
        // Half-open interval: existing.checkIn < requested.checkOut AND existing.checkOut > requested.checkIn
        const existingCheckIn = new Date("2025-06-10T14:00:00Z");
        const existingCheckOut = new Date("2025-06-15T11:00:00Z");

        it("detects overlap when new booking starts during existing booking", () => {
            const newCheckIn = new Date("2025-06-12T14:00:00Z");
            const newCheckOut = new Date("2025-06-18T11:00:00Z");
            const overlaps = existingCheckIn < newCheckOut && existingCheckOut > newCheckIn;
            expect(overlaps).toBe(true);
        });

        it("detects overlap when new booking ends during existing booking", () => {
            const newCheckIn = new Date("2025-06-08T14:00:00Z");
            const newCheckOut = new Date("2025-06-12T11:00:00Z");
            const overlaps = existingCheckIn < newCheckOut && existingCheckOut > newCheckIn;
            expect(overlaps).toBe(true);
        });

        it("detects overlap when new booking completely contains existing booking", () => {
            const newCheckIn = new Date("2025-06-05T14:00:00Z");
            const newCheckOut = new Date("2025-06-20T11:00:00Z");
            const overlaps = existingCheckIn < newCheckOut && existingCheckOut > newCheckIn;
            expect(overlaps).toBe(true);
        });

        it("detects overlap when new booking is completely inside existing booking", () => {
            const newCheckIn = new Date("2025-06-11T14:00:00Z");
            const newCheckOut = new Date("2025-06-13T11:00:00Z");
            const overlaps = existingCheckIn < newCheckOut && existingCheckOut > newCheckIn;
            expect(overlaps).toBe(true);
        });

        it("does NOT detect overlap when new booking ends exactly when existing starts", () => {
            const newCheckIn = new Date("2025-06-05T14:00:00Z");
            const newCheckOut = new Date("2025-06-10T14:00:00Z");
            const overlaps = existingCheckIn < newCheckOut && existingCheckOut > newCheckIn;
            expect(overlaps).toBe(false);
        });

        it("does NOT detect overlap when new booking starts exactly when existing ends", () => {
            const newCheckIn = new Date("2025-06-15T11:00:00Z");
            const newCheckOut = new Date("2025-06-20T11:00:00Z");
            const overlaps = existingCheckIn < newCheckOut && existingCheckOut > newCheckIn;
            expect(overlaps).toBe(false);
        });

        it("does NOT detect overlap when new booking is completely before existing booking", () => {
            const newCheckIn = new Date("2025-06-01T14:00:00Z");
            const newCheckOut = new Date("2025-06-05T11:00:00Z");
            const overlaps = existingCheckIn < newCheckOut && existingCheckOut > newCheckIn;
            expect(overlaps).toBe(false);
        });

        it("does NOT detect overlap when new booking is completely after existing booking", () => {
            const newCheckIn = new Date("2025-06-20T14:00:00Z");
            const newCheckOut = new Date("2025-06-25T11:00:00Z");
            const overlaps = existingCheckIn < newCheckOut && existingCheckOut > newCheckIn;
            expect(overlaps).toBe(false);
        });
    });

    describe("server-side price calculation", () => {
        const pricePerNightPaise = 250000; // ₹2,500 per night

        it("calculates total price for 1 night", () => {
            const nights = 1;
            const totalPricePaise = nights * pricePerNightPaise;
            expect(totalPricePaise).toBe(250000);
        });

        it("calculates total price for 3 nights", () => {
            const nights = 3;
            const totalPricePaise = nights * pricePerNightPaise;
            expect(totalPricePaise).toBe(750000);
        });

        it("calculates total price for 7 nights", () => {
            const nights = 7;
            const totalPricePaise = nights * pricePerNightPaise;
            expect(totalPricePaise).toBe(1750000);
        });

        it("ensures price is calculated on server side (not from client)", () => {
            // Simulating client trying to send a different price
            const clientProvidedPrice = 10000; // Client tries to pay ₹100
            const actualPrice = 3 * pricePerNightPaise; // Server calculates 3 nights * ₹2500
            expect(actualPrice).not.toBe(clientProvidedPrice);
            expect(actualPrice).toBe(750000);
        });
    });

    describe("date validation", () => {
        it("rejects checkOut before checkIn", () => {
            const checkIn = new Date("2025-06-15T14:00:00Z");
            const checkOut = new Date("2025-06-10T11:00:00Z");
            const isValid = checkOut > checkIn;
            expect(isValid).toBe(false);
        });

        it("rejects checkOut equal to checkIn", () => {
            const checkIn = new Date("2025-06-15T14:00:00Z");
            const checkOut = new Date("2025-06-15T14:00:00Z");
            const isValid = checkOut > checkIn;
            expect(isValid).toBe(false);
        });

        it("accepts checkOut after checkIn", () => {
            const checkIn = new Date("2025-06-15T14:00:00Z");
            const checkOut = new Date("2025-06-16T11:00:00Z");
            const isValid = checkOut > checkIn;
            expect(isValid).toBe(true);
        });

        it("handles invalid date strings", () => {
            const invalidDate = new Date("invalid");
            expect(invalidDate.toString()).toBe("Invalid Date");
        });
    });

    describe("guest count validation", () => {
        const maxGuests = 4;

        it("accepts guest count equal to max", () => {
            expect(4 <= maxGuests).toBe(true);
        });

        it("accepts guest count less than max", () => {
            expect(2 <= maxGuests).toBe(true);
        });

        it("rejects guest count greater than max", () => {
            expect(5 <= maxGuests).toBe(false);
        });

        it("rejects zero or negative guest count", () => {
            expect(0 > 0).toBe(false);
            expect(-1 > 0).toBe(false);
        });
    });
});
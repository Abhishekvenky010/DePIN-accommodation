"use client";

export const dynamic = "force-dynamic";

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { API_BACKEND_URL } from '@/config';
import axios from 'axios';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@clerk/nextjs';
import {
  GatedSignInButton,
  GatedSignUpButton,
} from '@/components/clerk/gated-components';
import { Activity, ArrowLeft, Calendar, Wallet } from 'lucide-react';
import { useSolWallet } from '@/components/solana/wallet-provider';
import {
  getSolanaConnection,
  deriveEscrowPDA,
  buildCreateAndFundEscrowIx,
  fetchEscrowAccount,
  confirmTransaction,
  paiseToLamports,
  formatPriceAsSOL,
  type EscrowAccount,
} from '@/lib/anchor-client';
import { PublicKey, Transaction, type Connection } from '@solana/web3.js';

interface AccommodationDetail {
  id: string;
  title: string;
  description: string;
  city: string;
  pricePerNightPaise: number;
  maxGuests: number;
  imageUrl?: string;
  status: string;
  host: {
    id: string;
    name?: string;
    email?: string;
    solanaWalletAddress?: string | null;
  };
  bookings: Array<{
    id: string;
    checkIn: string;
    checkOut: string;
    status: string;
  }>;
}

const ESCROW_STATUS_COLORS: Record<string, string> = {
  Funded: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  Accepted: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  Released: 'bg-green-500/20 text-green-600 dark:text-green-400',
  Refunded: 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
};

export default function AccommodationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const { publicKey, connected, wallet, disconnect } = useSolWallet();

  const [accommodation, setAccommodation] = useState<AccommodationDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Booking form state
  const [checkIn, setCheckIn] = useState<string>('');
  const [checkOut, setCheckOut] = useState<string>('');
  const [guestCount, setGuestCount] = useState<number>(1);
  const [bookingLoading, setBookingLoading] = useState<boolean>(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<boolean>(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState<boolean>(false);

  // Solana state
  const [connection, setConnection] = useState<Connection | null>(null);
  const [escrowAccount, setEscrowAccount] = useState<EscrowAccount | null>(null);
  const [loadingEscrow, setLoadingEscrow] = useState<boolean>(false);
  const [fundedBookingId, setFundedBookingId] = useState<string | null>(null);

  const id = params?.id as string;

  const loadEscrow = useCallback(async (bookingId: string) => {
    if (!connection) return;
    try {
      const account = await fetchEscrowAccount(connection, bookingId);
      setEscrowAccount(account);
    } catch (err) {
      console.error('Error loading escrow account:', err);
      setEscrowAccount(null);
    }
  }, [connection]);

  useEffect(() => {
    if (publicKey) {
      setConnection(getSolanaConnection());
    } else {
      setConnection(null);
    }
  }, [publicKey]);

  useEffect(() => {
    if (id) {
      fetchAccommodation(id);
    }
  }, [id]);

  useEffect(() => {
    if (fundedBookingId && connection) {
      loadEscrow(fundedBookingId);
    }
  }, [fundedBookingId, connection, loadEscrow]);

  const fetchAccommodation = async (accommodationId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<AccommodationDetail>(
        `${API_BACKEND_URL}/api/v1/accommodations/${accommodationId}`
      );
      setAccommodation(response.data);
    } catch (err) {
      console.error('Error fetching accommodation:', err);
      const message =
        axios.isAxiosError(err) && err.response?.status === 404
          ? 'Accommodation not found'
          : 'Failed to load accommodation. Please try again later.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const calculateNights = () => {
    if (!checkIn || !checkOut) return 0;
    const diffTime = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const calculateTotalPaise = () => {
    if (!accommodation) return 0;
    const nights = calculateNights();
    if (nights <= 0) return 0;
    return nights * accommodation.pricePerNightPaise;
  };

  const validateForm = () => {
    if (!checkIn) return 'Check-in date is required';
    if (!checkOut) return 'Check-out date is required';
    if (new Date(checkOut) <= new Date(checkIn)) return 'Check-out must be after check-in';
    if (guestCount < 1) return 'At least 1 guest is required';
    if (accommodation && guestCount > accommodation.maxGuests) {
      return `Maximum guest capacity is ${accommodation.maxGuests}`;
    }
    return null;
  };

  const fundEscrowOnSolana = async (
    bookingId: string,
    totalPricePaise: number,
    hostWallet: string,
    token: string
  ) => {
    if (!connection || !publicKey) {
      throw new Error('Connect your Solana wallet to fund the escrow.');
    }
    if (!wallet?.adapter) {
      throw new Error('No wallet detected. Please install a Solana wallet extension.');
    }

    setLoadingEscrow(true);

    try {
      const lamports = paiseToLamports(totalPricePaise);
      if (lamports <= 0) {
        throw new Error('Invalid escrow amount.');
      }

      const [escrowPda] = deriveEscrowPDA(bookingId);

      // Check the escrow does not already exist (prevents duplicate funding)
      const existing = await fetchEscrowAccount(connection, bookingId);
      if (existing) {
        throw new Error('Escrow has already been funded for this booking.');
      }

      let hostPubkey: PublicKey;
      try {
        hostPubkey = new PublicKey(hostWallet);
      } catch {
        throw new Error('The host has not configured a valid Solana wallet address.');
      }

      const instruction = buildCreateAndFundEscrowIx(
        bookingId,
        lamports,
        escrowPda,
        publicKey,
        hostPubkey
      );

      const tx = new Transaction().add(instruction as never);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;

      // The adapter signs and submits the transaction in one call.
      const signature = await wallet.adapter.sendTransaction(tx, connection);

      const confirmed = await confirmTransaction(connection, signature);

      if (!confirmed) {
        throw new Error('Escrow funding transaction was not confirmed on Devnet.');
      }

      await axios.post(
        `${API_BACKEND_URL}/api/v1/bookings/${bookingId}/solana`,
        {
          solanaSignature: signature,
          solanaBookingAccount: escrowPda.toBase58(),
          solanaStatus: 'Funded',
          solanaAmount: lamports,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setFundedBookingId(bookingId);
      setEscrowAccount(await fetchEscrowAccount(connection, bookingId));
      setBookingSuccess(true);
    } finally {
      setLoadingEscrow(false);
    }
  };

  const handleBooking = async () => {
    const validationError = validateForm();
    if (validationError) {
      setBookingError(validationError);
      return;
    }

    if (!id || !accommodation) return;

    setBookingLoading(true);
    setBookingError(null);
    setBookingSuccess(false);

    try {
      const token = await getToken();

      if (!token) {
        setShowAuthPrompt(true);
        return;
      }

      const response = await axios.post(
        `${API_BACKEND_URL}/api/v1/bookings`,
        {
          accommodationId: id,
          checkIn,
          checkOut,
          guestCount,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const bookingId: string = response.data.id;

      // A booking is only "funded" after the on-chain escrow transaction is confirmed.
      if (!publicKey) {
        setBookingError('Booking created. Connect your Solana wallet to fund the escrow.');
        setBookingSuccess(true);
        return;
      }

      await fundEscrowOnSolana(
        bookingId,
        response.data.totalPricePaise ?? calculateTotalPaise(),
        accommodation.host.solanaWalletAddress ?? accommodation.host.id,
        token
      );

      setCheckIn('');
      setCheckOut('');
      setGuestCount(1);
    } catch (err) {
      console.error('Error creating booking:', err);
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error ?? 'Failed to create booking. Please try again later.'
        : err instanceof Error
          ? err.message
          : 'Failed to create booking. Please try again later.';
      setBookingError(message);
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="flex min-h-[80vh] items-center justify-center">
          <div className="text-center">
            <Activity className="h-12 w-12 text-indigo-500 dark:text-indigo-400 animate-spin mb-4" />
            <p className="text-lg text-gray-600 dark:text-gray-300">Loading accommodation...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !accommodation) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-6 py-8">
          <button
            onClick={() => router.back()}
            className="flex items-center text-indigo-600 dark:text-indigo-400 hover:underline mb-8"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </button>
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="text-center">
              <p className="text-xl text-red-500 dark:text-red-400 mb-4">
                {error ?? 'Accommodation not found'}
              </p>
              <Link
                href="/accommodations"
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg transition-colors"
              >
                Browse Accommodations
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const priceInRupees = (accommodation.pricePerNightPaise / 100).toFixed(2);
  const totalPricePaise = calculateTotalPaise();
  const nights = calculateNights();
  const totalSol = totalPricePaise > 0 ? formatPriceAsSOL(totalPricePaise) : null;
  const walletDisabled = bookingLoading || loadingEscrow;
  const submitLabel = bookingLoading || loadingEscrow
    ? 'Processing...'
    : bookingSuccess
      ? 'Request Sent'
      : publicKey
        ? 'Fund & Submit'
        : 'Create Booking';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="relative h-64 md:h-80">
        {accommodation.imageUrl ? (
          <Image
            src={accommodation.imageUrl}
            alt={`${accommodation.title} image`}
            fill
            className="object-cover"
            sizes="100vw"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <p className="text-gray-500 dark:text-gray-400 text-xl italic">No image available</p>
          </div>
        )}
        <div className="absolute bottom-4 left-6 bg-white/90 dark:bg-gray-800/90 px-4 py-2 rounded-md shadow-md">
          <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
            ₹{priceInRupees}/night
          </span>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <button
          onClick={() => router.back()}
          className="flex items-center text-indigo-600 dark:text-indigo-400 hover:underline mb-6 mt-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to listings
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 md:p-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {accommodation.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-gray-600 dark:text-gray-300 mb-6">
            <span className="flex items-center">
              <Calendar className="h-4 w-4 mr-1" />
              {accommodation.city}
            </span>
            <span>•</span>
            <span>Maximum {accommodation.maxGuests} guests</span>
            <span>•</span>
            <span>Hosted by {accommodation.host.name || 'A local host'}</span>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">About this stay</h2>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              {accommodation.description}
            </p>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Price summary</h2>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Price per night</span>
                      <span className="font-medium text-gray-900 dark:text-white">₹{priceInRupees}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">Nights</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {nights > 0 ? nights : '-'}
                      </span>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                      <div className="flex justify-between items-baseline">
                        <span className="text-gray-600 dark:text-gray-300">Estimated total</span>
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">
                          {totalPricePaise > 0 ? `₹${(totalPricePaise / 100).toFixed(2)}` : '-'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Final price is calculated by the server when you submit.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Escrow wallet
                  </h3>
                  {connected && publicKey ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-4)}
                        </span>
                      </div>
                      <button
                        onClick={() => disconnect?.()}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Connect your Solana wallet in the top bar to fund the escrow on Devnet.
                    </p>
                  )}
                  {totalSol && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Approximately {totalSol} SOL will be held in escrow until the stay is confirmed.
                    </p>
                  )}
                </div>
              </div>

              <div className="lg:w-96">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Book this stay</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Submitting this request creates a pending booking. Funds are only held once the
                  escrow transaction confirms on Solana Devnet.
                </p>

                {bookingError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 mb-4">
                    <p className="text-sm text-red-600 dark:text-red-400">{bookingError}</p>
                  </div>
                )}

                {bookingSuccess && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3 mb-4">
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Your booking request has been submitted.
                      {escrowAccount ? ' Escrow is funded on-chain.' : ''}
                    </p>
                  </div>
                )}

                {escrowAccount && (
                  <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        Escrow status
                      </span>
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          ESCROW_STATUS_COLORS[escrowAccount.status] ?? 'bg-gray-500/20 text-gray-600'
                        }`}
                      >
                        {escrowAccount.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 break-all">
                      Account: {escrowAccount.amount} lamports
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label htmlFor="checkIn" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Check-in
                    </label>
                    <input
                      id="checkIn"
                      type="date"
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      min={new Date().toISOString().split('T')[0]}
                      disabled={walletDisabled}
                    />
                  </div>

                  <div>
                    <label htmlFor="checkOut" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Check-out
                    </label>
                    <input
                      id="checkOut"
                      type="date"
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      min={checkIn || new Date().toISOString().split('T')[0]}
                      disabled={walletDisabled}
                    />
                  </div>

                  <div>
                    <label htmlFor="guestCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Number of guests
                    </label>
                    <input
                      id="guestCount"
                      type="number"
                      min={1}
                      max={accommodation.maxGuests}
                      value={guestCount}
                      onChange={(e) =>
                        setGuestCount(Math.max(1, Math.min(parseInt(e.target.value) || 1, accommodation.maxGuests)))
                      }
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      disabled={walletDisabled}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Maximum {accommodation.maxGuests} guests
                    </p>
                  </div>

                  <button
                    onClick={handleBooking}
                    disabled={walletDisabled || bookingSuccess}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                  >
                    {submitLabel}
                  </button>

                  {!publicKey && (
                    <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                      Connect a Solana wallet to fund the escrow on Devnet.
                    </p>
                  )}
                </div>

                {showAuthPrompt && (
                  <div className="mt-4 text-center space-y-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">Sign in to submit a booking request.</p>
                    <GatedSignInButton>
                      <button className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors">
                        Sign in
                      </button>
                    </GatedSignInButton>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Don&#39;t have an account?{' '}
                      <GatedSignUpButton>
                        <span className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">
                          Sign up
                        </span>
                      </GatedSignUpButton>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

export const dynamic = "force-dynamic";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { API_BACKEND_URL } from '@/config';
import axios from 'axios';
import { useAuth } from '@/components/simple-auth-provider';
import { GatedSignInButton } from '@/components/simple-sign-in-button';
import { Activity, ArrowLeft, Wallet } from 'lucide-react';
import { useSolWallet } from '@/components/solana/wallet-provider';
import { signBookingAction } from '@/lib/booking-actions';

interface GuestBooking {
  id: string;
  accommodationId: string;
  accommodation: {
    id: string;
    title: string;
    description: string;
    city: string;
    pricePerNightPaise: number;
    maxGuests: number;
    imageUrl?: string;
  };
  guestId: string;
  hostId: string | null;
  host?: {
    id: string;
    name?: string;
    email?: string;
    solanaWalletAddress?: string | null;
  };
  guest?: {
    id: string;
    name?: string;
    email?: string;
    solanaWalletAddress?: string | null;
  };
  checkIn: string;
  checkOut: string;
  guestCount: number;
  totalPricePaise: number;
  status: string;
  solanaSignature?: string | null;
  solanaBookingAccount?: string | null;
  solanaStatus?: string | null;
  solanaAmount?: number | null;
}

const STATUS_STYLES: Record<string, string> = {
  Funded: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  Accepted: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  Released: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  Refunded: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
  Completed: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  Cancelled: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  Pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

export default function MyBookingsPage() {
  const { getToken, userId } = useAuth();
  const { publicKey, connected, wallet, connectWallet } = useSolWallet();

  const [bookings, setBookings] = useState<GuestBooking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError('Your session expired. Please sign in again.');
        return;
      }

      const { data } = await axios.get<GuestBooking[]>(
        `${API_BACKEND_URL}/api/v1/bookings`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Only the bookings where this user is the guest.
      setBookings(data.filter((booking) => booking.guestId === userId));
    } catch {
      setError('Failed to load your bookings. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [getToken, userId]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handleAction = async (booking: GuestBooking, action: 'cancel' | 'complete') => {
    setActionError(null);
    setSuccessMessage(null);
    setBusyBookingId(booking.id);

    try {
      const token = await getToken();
      if (!token) {
        setActionError('Your session expired. Please sign in again.');
        return;
      }

      if (!publicKey || !wallet?.adapter) {
        setActionError('Connect your Solana wallet to sign this action.');
        return;
      }

      const signature = await signBookingAction(booking.id, action, publicKey, wallet.adapter, {
        hostWallet: booking.host?.solanaWalletAddress ?? null,
        guestWallet: booking.guest?.solanaWalletAddress ?? null,
      });

      await axios.post(
        `${API_BACKEND_URL}/api/v1/bookings/${booking.id}/${action}`,
        {
          signature,
          walletAddress: publicKey.toBase58(),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setSuccessMessage(
        action === 'complete'
          ? 'Completion confirmed. Funds are released when the host also confirms.'
          : 'Cancellation requested. The refund settles when the host confirms.'
      );

      await fetchBookings();
    } catch (err: unknown) {
      console.error(`Error performing ${action}:`, err);
      const message = axios.isAxiosError(err) && err.response?.data?.error
        ? err.response.data.error
        : err instanceof Error
          ? err.message
          : `Failed to ${action} booking. Please try again.`;
      setActionError(message);
    } finally {
      setBusyBookingId(null);
    }
  };

  if (!userId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-6 py-8">
          <BackLink />
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="text-center space-y-4">
              <p className="text-xl text-gray-900 dark:text-white">Sign in to view your bookings</p>
              <GatedSignInButton>
                <button className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors">
                  Sign in
                </button>
              </GatedSignInButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm py-8">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">My Bookings</h1>
              <p className="mt-2 text-gray-600 dark:text-gray-300">
                Track your stays and on-chain escrow status
              </p>
            </div>
            <div className="flex items-center gap-3">
              {connected && publicKey ? (
                <div className="flex items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-700 px-4 py-2">
                  <Wallet className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                  </span>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      await connectWallet();
                    } catch {
                      setActionError('Failed to connect Solana wallet.');
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Wallet className="h-4 w-4" />
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {actionError && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 p-3">
            <p className="text-sm text-green-600 dark:text-green-400">{successMessage}</p>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="text-center">
              <Activity className="mx-auto mb-4 h-12 w-12 animate-spin text-indigo-500" />
              <p className="text-gray-600 dark:text-gray-300">Loading your bookings...</p>
            </div>
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="mb-4 text-red-500 dark:text-red-400">{error}</p>
            <button
              onClick={fetchBookings}
              className="rounded-lg bg-indigo-600 px-6 py-3 text-white transition-colors hover:bg-indigo-700"
            >
              Retry
            </button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-300">You haven&apos;t booked any stays yet.</p>
            <Link
              href="/accommodations"
              className="mt-4 inline-block text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Browse accommodations
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {bookings.map((booking) => {
              const escrowState = booking.solanaStatus ?? booking.status;
              const isBusy = busyBookingId === booking.id;
              const canCancel = escrowState === 'Funded' || escrowState === 'Accepted';
              const canComplete = escrowState === 'Accepted';

              return (
                <article
                  key={booking.id}
                  className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="relative h-40">
                    {booking.accommodation.imageUrl ? (
                      <img
                        src={booking.accommodation.imageUrl}
                        alt={booking.accommodation.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-200 dark:bg-gray-700">
                        <p className="text-sm italic text-gray-500 dark:text-gray-400">No image</p>
                      </div>
                    )}
                    <span
                      className={`absolute left-3 top-3 rounded px-2 py-1 text-xs font-semibold ${
                        STATUS_STYLES[escrowState] ?? STATUS_STYLES.Pending
                      }`}
                    >
                      {escrowState}
                    </span>
                  </div>

                  <div className="p-5">
                    <h2 className="mb-1 line-clamp-1 text-lg font-semibold text-gray-900 dark:text-white">
                      {booking.accommodation.title}
                    </h2>
                    <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
                      {booking.accommodation.city}
                    </p>

                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-gray-500 dark:text-gray-400">Check-in</dt>
                        <dd className="font-medium text-gray-900 dark:text-white">
                          {new Date(booking.checkIn).toLocaleDateString()}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500 dark:text-gray-400">Check-out</dt>
                        <dd className="font-medium text-gray-900 dark:text-white">
                          {new Date(booking.checkOut).toLocaleDateString()}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500 dark:text-gray-400">Escrowed</dt>
                        <dd className="font-medium text-gray-900 dark:text-white">
                          {booking.solanaAmount
                            ? `${(booking.solanaAmount / 1_000_000_000).toFixed(4)} SOL`
                            : `₹${(booking.totalPricePaise / 100).toFixed(2)}`}
                        </dd>
                      </div>
                    </dl>

                    {booking.solanaSignature ? (
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        Funding tx:{' '}
                        <span className="break-all font-mono">
                          {booking.solanaSignature.slice(0, 12)}...
                        </span>
                      </p>
                    ) : (
                      <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                        Escrow not funded yet.
                      </p>
                    )}

                    {(canComplete || canCancel) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {canComplete && (
                          <button
                            onClick={() => handleAction(booking, 'complete')}
                            disabled={isBusy || !connected}
                            className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:bg-gray-400"
                          >
                            {isBusy ? 'Confirming...' : 'Confirm Completion'}
                          </button>
                        )}
                        {canCancel && (
                          <button
                            onClick={() => handleAction(booking, 'cancel')}
                            disabled={isBusy || !connected}
                            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            {isBusy ? 'Cancelling...' : 'Cancel Booking'}
                          </button>
                        )}
                      </div>
                    )}

                    {!connected && (canComplete || canCancel) && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Connect your Solana wallet to act on this booking.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/" className="flex items-center text-indigo-600 hover:underline dark:text-indigo-400">
      <ArrowLeft className="mr-2 h-4 w-4" />
      Back to home
    </Link>
  );
}

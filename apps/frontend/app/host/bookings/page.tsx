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

interface BookingDetail {
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
    hostId: string;
  };
  guestId: string;
  guest: {
    id: string;
    name?: string;
    email?: string;
    solanaWalletAddress?: string | null;
  };
  hostId: string | null;
  host?: {
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
  createdAt: string;
  updatedAt: string;
}

type ActionType = 'accept' | 'reject' | 'cancel' | 'complete';

const STATUS_COLORS: Record<string, string> = {
  Funded: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  Accepted: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  Confirmed: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  Completed: 'bg-green-500/20 text-green-600 dark:text-green-400',
  Released: 'bg-green-500/20 text-green-600 dark:text-green-400',
  Refunded: 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
  Cancelled: 'bg-red-500/20 text-red-600 dark:text-red-400',
  Pending: 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
};

export default function HostBookingsPage() {
  const { getToken, userId } = useAuth();
  const { publicKey, connected, connectWallet, wallet, disconnect } = useSolWallet();

  const [bookings, setBookings] = useState<BookingDetail[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [authPrompt, setAuthPrompt] = useState<boolean>(false);
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(null);
  const [actionLoading, setActionLoading] = useState<ActionType | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    if (!userId) {
      setAuthPrompt(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();

      if (!token) {
        setAuthPrompt(true);
        setLoading(false);
        return;
      }

      const response = await axios.get<BookingDetail[]>(
        `${API_BACKEND_URL}/api/v1/bookings`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setBookings(response.data);
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setError('Failed to load bookings. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [getToken, userId]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handleAction = async (booking: BookingDetail, action: ActionType) => {
    setActionError(null);

    // Only the wallet that matches the booking party on-chain can sign the
    // transition, so require a connected wallet before opening the action.
    if (!connected || !publicKey) {
      setActionError('Connect your Solana wallet to perform this action.');
      return;
    }

    if (action === 'accept' || action === 'reject' || action === 'cancel' || action === 'complete') {
      setSelectedBooking(booking);
      await submitBookingAction(booking, action);
    }
  };

  const submitBookingAction = async (booking: BookingDetail, action: ActionType) => {
    setActionLoading(action);
    setActionError(null);

    try {
      const token = await getToken();

      if (!token) {
        setAuthPrompt(true);
        return;
      }

      if (!publicKey || !wallet?.adapter) {
        setActionError('Connect your Solana wallet to sign the on-chain action.');
        return;
      }

      // 1. Build and sign the on-chain transition for this booking.
      const signature = await signBookingAction(
        booking.id,
        action,
        publicKey,
        wallet.adapter,
        {
          hostWallet: booking.host?.solanaWalletAddress ?? null,
          guestWallet: booking.guest?.solanaWalletAddress ?? null,
        }
      );

      // 2. Submit the confirmed signature so the backend can verify it.
      await axios.post(
        `${API_BACKEND_URL}/api/v1/bookings/${booking.id}/${action}`,
        {
          signature,
          walletAddress: publicKey.toBase58(),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      await fetchBookings();
      setSelectedBooking(null);
    } catch (err: unknown) {
      console.error(`Error performing ${action}:`, err);
      const message = axios.isAxiosError(err) && err.response?.data?.error
        ? err.response.data.error
        : err instanceof Error
          ? err.message
          : `Failed to ${action} booking. Please try again.`;
      setActionError(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleConnectWallet = async () => {
    try {
      if (!wallet) {
        setError('No Solana wallet detected. Please install Phantom.');
        return;
      }

      if (!connected) {
        await connectWallet();
      }
    } catch (err) {
      console.error('Error connecting wallet:', err);
      setError('Failed to connect Solana wallet. Please check your extension.');
    }
  };

  if (authPrompt || !userId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-6 py-8">
          <BackButton />
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="text-center space-y-4">
              <p className="text-xl text-gray-900 dark:text-white">
                Sign in to view and manage your bookings
              </p>
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="flex min-h-[80vh] items-center justify-center">
          <div className="text-center">
            <Activity className="h-12 w-12 text-indigo-500 dark:text-indigo-400 animate-spin mb-4" />
            <p className="text-lg text-gray-600 dark:text-gray-300">Loading bookings...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !selectedBooking) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-6 py-8">
          <BackButton />
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="text-center space-y-4">
              <p className="text-xl text-red-500 dark:text-red-400">{error}</p>
              <button
                onClick={fetchBookings}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Bookings where the current user is the host (hostId)
  const hostedBookings = bookings.filter((b) => b.hostId === userId);
  // Bookings where the current user is the guest
  const guestBookings = bookings.filter((b) => b.guestId === userId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm py-8">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
                Host Dashboard
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-300">
                Manage bookings for your listings and on-chain escrows
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/host/accommodations/new"
                className="px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                List a Space
              </Link>
              {connected ? (
                <div className="flex items-center gap-3 rounded-full bg-gray-100 dark:bg-gray-700 px-4 py-2">
                  <Wallet className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
                  </span>
                  <button
                    onClick={() => disconnect?.()}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectWallet}
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

      <main className="container mx-auto px-6 py-8 space-y-12">
        {/* Bookings for the current user's listings */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Bookings for your listings
          </h2>
          {hostedBookings.length === 0 ? (
            <EmptyState message="No bookings for your listings yet." />
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {hostedBookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  role="host"
                  actionLoading={actionLoading && selectedBooking?.id === booking.id ? actionLoading : null}
                  onAction={(action) => handleAction(booking, action)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Bookings where the current user is the guest */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Your bookings as a guest
          </h2>
          {guestBookings.length === 0 ? (
            <EmptyState message="You haven't booked any stays yet." />
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {guestBookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  role="guest"
                  actionLoading={actionLoading && selectedBooking?.id === booking.id ? actionLoading : null}
                  onAction={(action) => handleAction(booking, action)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Action feedback modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {actionLoading ? 'Processing...' : 'Action submitted'}
            </h3>
            {actionError && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">{actionError}</p>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              {selectedBooking.accommodation.title} &middot;{' '}
              {new Date(selectedBooking.checkIn).toLocaleDateString()}
            </p>
            <div className="flex justify-end gap-3">
              {!actionLoading && (
                <button
                  onClick={() => {
                    setSelectedBooking(null);
                    setActionError(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BackButton() {
  return (
    <button
      onClick={() => window.history.back()}
      className="flex items-center text-indigo-600 dark:text-indigo-400 hover:underline mb-6 mt-2"
    >
      <ArrowLeft className="h-4 w-4 mr-2" />
      Back
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 py-12 text-center">
      <p className="text-gray-600 dark:text-gray-300">{message}</p>
    </div>
  );
}

interface BookingCardProps {
  booking: BookingDetail;
  role: 'host' | 'guest';
  actionLoading: ActionType | null;
  onAction: (action: ActionType) => void;
}

function BookingCard({ booking, role, actionLoading, onAction }: BookingCardProps) {
  const solanaStatus = booking.solanaStatus ?? booking.status;
  const priceInRupees = (booking.totalPricePaise / 100).toFixed(2);

  const canAccept = role === 'host' && solanaStatus === 'Funded';
  const canReject = role === 'host' && solanaStatus === 'Funded';
  const canComplete = role === 'host' && solanaStatus === 'Accepted';
  const canCancel =
    (solanaStatus === 'Funded' || solanaStatus === 'Accepted') &&
    (role === 'host' || role === 'guest');

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700">
      <div className="relative h-40">
        {booking.accommodation.imageUrl ? (
          <img
            src={booking.accommodation.imageUrl}
            alt={booking.accommodation.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm italic">No image</p>
          </div>
        )}
        <span
          className={`absolute top-3 left-3 px-2 py-1 rounded text-xs font-semibold ${
            STATUS_COLORS[solanaStatus] ?? STATUS_COLORS.Pending
          }`}
        >
          {solanaStatus}
        </span>
      </div>

      <div className="p-5">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 line-clamp-1">
          {booking.accommodation.title}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          {booking.accommodation.city} &middot; {booking.guestCount} guest
          {booking.guestCount > 1 ? 's' : ''}
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
            <dt className="text-gray-500 dark:text-gray-400">{role === 'host' ? 'Guest' : 'Host'}</dt>
            <dd className="font-medium text-gray-900 dark:text-white">
              {role === 'host'
                ? booking.guest.name || booking.guest.email || 'Guest'
                : booking.host?.name || booking.host?.email || 'Host'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500 dark:text-gray-400">Total</dt>
            <dd className="font-medium text-gray-900 dark:text-white">₹{priceInRupees}</dd>
          </div>
        </dl>

        {booking.solanaSignature && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 break-all">
            Tx: {booking.solanaSignature.slice(0, 16)}...
          </p>
        )}

        {(canAccept || canReject || canComplete || canCancel) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {canAccept && (
              <button
                onClick={() => onAction('accept')}
                disabled={actionLoading !== null}
                className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-md transition-colors"
              >
                {actionLoading === 'accept' ? 'Accepting...' : 'Accept'}
              </button>
            )}
            {canReject && (
              <button
                onClick={() => onAction('reject')}
                disabled={actionLoading !== null}
                className="flex-1 px-3 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 text-sm font-medium rounded-md transition-colors"
              >
                {actionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
              </button>
            )}
            {canComplete && (
              <button
                onClick={() => onAction('complete')}
                disabled={actionLoading !== null}
                className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium rounded-md transition-colors"
              >
                {actionLoading === 'complete' ? 'Completing...' : 'Confirm Completion'}
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => onAction('cancel')}
                disabled={actionLoading !== null}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 text-sm font-medium rounded-md transition-colors"
              >
                {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

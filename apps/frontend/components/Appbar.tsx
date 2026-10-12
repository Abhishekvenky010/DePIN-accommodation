"use client";

import Link from 'next/link';
import { WalletStatus } from "@/components/solana/wallet-status";
import { useClerkEnabled } from "@/components/clerk-provider-gate";
import {
  GatedSignedIn,
  GatedSignedOut,
  GatedSignInButton,
  GatedSignUpButton,
  GatedUserButton,
} from "@/components/clerk/gated-components";

/**
 * Top navigation.
 *
 * Clerk-rendered controls are only shown when a Clerk publishable key is
 * configured; without one the bar still renders plain navigation links so the
 * app builds and runs while credentials are pending.
 */
export function Appbar() {
    const clerkEnabled = useClerkEnabled();

    return  <div className="flex justify-between items-center p-4">
        <Link href="/" className="text-gray-900 dark:text-white">DPin Uptime</Link>
        <div>
            {clerkEnabled && (
                <>
                    <GatedSignedOut>
                        <GatedSignInButton>
                            <button className="text-sm text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400">
                                Sign in
                            </button>
                        </GatedSignInButton>
                        <GatedSignUpButton>
                            <button className="ml-3 text-sm text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400">
                                Sign up
                            </button>
                        </GatedSignUpButton>
                    </GatedSignedOut>
                    <GatedSignedIn>
                        <Link href="/accommodations" className="text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 mr-4">
                            Browse
                        </Link>
                        <Link href="/bookings" className="text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 mr-4">
                            My Bookings
                        </Link>
                        <Link href="/host/bookings" className="text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 mr-4">
                            Host Dashboard
                        </Link>
                        <Link href="/host/accommodations/new" className="text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 mr-4">
                            List a Space
                        </Link>
                        <GatedUserButton />
                    </GatedSignedIn>
                </>
            )}
            <Link href="/accommodations" className="text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 mr-4">
                Browse
            </Link>
            <WalletStatus />
        </div>
    </div>
  }

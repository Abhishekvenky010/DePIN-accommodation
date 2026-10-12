"use client";

import Link from 'next/link';
import { WalletStatus } from "@/components/solana/wallet-status";
import { useAuth } from '@/components/simple-auth-provider';

export function Appbar() {
    const { isSignedIn } = useAuth();

    return  <div className="flex justify-between items-center p-4">
        <Link href="/" className="text-gray-900 dark:text-white">DPin Uptime</Link>
        <div>
            {isSignedIn && (
                <>
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
                </>
            )}
            <Link href="/accommodations" className="text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 mr-4">
                Browse
            </Link>
            <WalletStatus />
        </div>
    </div>
  }
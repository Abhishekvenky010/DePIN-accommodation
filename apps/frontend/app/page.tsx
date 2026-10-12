"use client"
export const dynamic = "force-dynamic";
import React from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck, ArrowRight } from 'lucide-react';

function App() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 dark:text-white transition-colors duration-200">
      {/* Hero Section */}
      <section className="container mx-auto px-6 py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white leading-tight">
              Book Stays with On-Chain Escrow
            </h1>
            <p className="mt-6 text-xl text-gray-600 dark:text-gray-300">
              Hosts list rooms and spaces, guests browse and fund their booking with SOL on
              Solana Devnet. Funds are only released when both sides confirm completion.
            </p>
            <div className="mt-8 flex flex-wrap space-x-4">
              <button
                onClick={() => router.push('/accommodations')}
                className="px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition flex items-center"
              >
                Browse Stays
                <ArrowRight className="ml-2 h-5 w-5" />
              </button>
              <button
                onClick={() => router.push('/host/accommodations/new')}
                className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 transition dark:text-white"
              >
                List Your Space
              </button>
            </div>
          </div>
          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80"
              alt="Accommodation"
              className="rounded-lg shadow-2xl"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 dark:bg-gray-800/50 py-20">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-16">
            Trustless accommodation escrow on Solana
          </h2>
          <div className="grid md:grid-cols-3 gap-12">
            <FeatureCard
              icon={<KeyRound className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />}
              title="SOL Escrow Funding"
              description="Guests fund a per-booking escrow account on Solana Devnet before the stay is confirmed."
            />
            <FeatureCard
              icon={<ShieldCheck className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />}
              title="Mutual Confirmation"
              description="Funds are released to the host only when both guest and host confirm completion."
            />
            <FeatureCard
              icon={<ShieldCheck className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />}
              title="Cancellable & Refundable"
              description="Both parties can request cancellation; funds return to the guest when refunds are agreed."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-16">
            How it works
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                step: '1',
                title: 'Request',
                text: 'The guest submits a booking request with their dates and guest count.',
              },
              {
                step: '2',
                title: 'Fund escrow',
                text: 'The guest funds the escrow account with SOL from their connected wallet.',
              },
              {
                step: '3',
                title: 'Host accepts',
                text: 'The host accepts the request on-chain, marking the stay as confirmed.',
              },
              {
                step: '4',
                title: 'Settle',
                text: 'Both sides confirm completion and the program releases funds to the host.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg text-center"
              >
                <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white font-bold">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <p className="text-gray-400">
              &copy; {new Date().getFullYear()} DePIN Accommodations. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-gray-600 dark:text-gray-300">{description}</p>
    </div>
  );
}

export default App;

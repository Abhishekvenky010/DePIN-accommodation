"use client";

import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  WalletModalProvider,
  useWalletModal,
} from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
} from "@solana/wallet-adapter-phantom";
import {
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-solflare";
import {
  WalletConnectWalletAdapter,
} from "@solana/wallet-adapter-walletconnect";
import {
  LedgerWalletAdapter,
} from "@solana/wallet-adapter-ledger";
import {
  CloverWalletAdapter,
} from "@solana/wallet-adapter-clover";
import {
  NightlyWalletAdapter,
} from "@solana/wallet-adapter-nightly";
import { clusterApiUrl } from "@solana/web3.js";

const walletAdapters = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
  new WalletConnectWalletAdapter({
    network: WalletAdapterNetwork.Devnet,
    options: {
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
      relayUrl: "wss://relay.walletconnect.com",
      metadata: {
        name: "DePIN Accommodations",
        description: "Book stays with on-chain SOL escrow",
        url: "https://dpin-uptime.local",
        icons: [],
      },
    },
  }),
  new LedgerWalletAdapter(),
  new CloverWalletAdapter(),
  new NightlyWalletAdapter(),
];

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = clusterApiUrl("devnet");

  return (
    <WalletModalProvider>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider
          wallets={walletAdapters}
          autoConnect
          onError={(error: Error) => {
            console.error("Wallet error:", error);
          }}
        >
          {children}
        </WalletProvider>
      </ConnectionProvider>
    </WalletModalProvider>
  );
}

export function useSolWallet() {
  const {
    publicKey,
    connected,
    disconnecting,
    wallets,
    select,
    disconnect,
    connect,
    wallet,
  } = useWallet();
  const { setVisible } = useWalletModal();

  const shortAddress =
    publicKey && `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`;

  /**
   * Opens the wallet selection modal so the user can pick a provider and
   * authorize the connection. Handles a missing wallet extension by showing the
   * same modal, which lists installable wallets.
   */
  const connectWallet = async () => {
    try {
      setVisible(true);
    } catch (error) {
      console.error("Failed to open wallet modal:", error);
      throw new Error("Unable to open the wallet selection dialog.");
    }
  };

  /** True when a wallet is selected and its extension is available. */
  const hasWalletExtension = wallet !== null && wallet !== undefined;

  return {
    publicKey,
    shortAddress,
    connected,
    disconnecting,
    wallets,
    select,
    disconnect,
    connect,
    connectWallet,
    wallet,
    hasWalletExtension,
  };
}

export type UseSolWalletReturn = ReturnType<typeof useSolWallet>;
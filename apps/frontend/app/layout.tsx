import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Appbar } from "../components/Appbar";
import { ThemeProvider } from "@/components/theme-provider";
import { SolanaWalletProvider } from "@/components/solana/wallet-provider";
import { SolanaWalletSync } from "@/components/solana/solana-wallet-sync";
import { SimpleAuthProvider } from "@/components/simple-auth-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DePIN Accommodations",
  description: "Book stays with on-chain SOL escrow on Solana Devnet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <SimpleAuthProvider>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <ThemeProvider defaultTheme="dark" attribute="class" forcedTheme="dark">
            <SolanaWalletProvider>
              <SolanaWalletSync />
              <Appbar />
              {children}
            </SolanaWalletProvider>
          </ThemeProvider>
        </body>
      </SimpleAuthProvider>
  );
}
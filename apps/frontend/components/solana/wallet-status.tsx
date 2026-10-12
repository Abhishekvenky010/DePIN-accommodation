"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { CheckCircle, CircleDashed, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WalletStatus() {
  const { publicKey, connected, disconnecting } = useWallet();
  const { visible, setVisible } = useWalletModal();

  const shortAddress = publicKey?.toBase58().slice(0, 4) + "..." + publicKey?.toBase58().slice(-4);

  return (
    <div className="flex items-center gap-4">
      {publicKey && (
        <div className="flex items-center gap-2">
          {connected && !disconnecting ? (
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : (
            <CircleDashed className="w-4 h-4 text-gray-400 dark:text-gray-600" />
          )}
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {shortAddress}
          </span>
        </div>
      )}
      <Button 
        size="sm" 
        variant="outline" 
        className="h-8 px-3"
        onClick={() => setVisible(!visible)}
      >
        <Wallet className="w-4 h-4 mr-2" />
        {connected && !disconnecting ? "Wallet" : "Connect Wallet"}
      </Button>
    </div>
  );
}

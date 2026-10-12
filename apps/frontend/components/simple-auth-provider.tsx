"use client";

import type { ReactNode } from "react";

/**
 * Simple auth provider that mocks a user for development
 */
export function SimpleAuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * Hook to get mock auth state
 */
export function useAuth() {
  return {
    userId: "dev-user-123",
    getToken: async () => "dev-token",
    isSignedIn: true,
  };
}
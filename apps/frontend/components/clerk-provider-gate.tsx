"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

/**
 * Reports whether Clerk credentials are configured.
 *
 * The value is resolved after mount so the server-rendered (or prerendered)
 * output is always the no-Clerk fallback, avoiding a hydration mismatch when
 * credentials are supplied later.
 */
export function useClerkEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    setEnabled(Boolean(key) && !key!.startsWith("pk_test_placeholder"));
  }, []);

  return enabled;
}

/** Static check used by non-hook call sites (server components). */
export function hasClerkKey(): boolean {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return Boolean(key) && !key!.startsWith("pk_test_placeholder");
}

/**
 * Wraps the app in Clerk once credentials are detected on the client.
 *
 * Rendering `ClerkProvider` with a missing or placeholder key throws during
 * prerendering, so the app mounts without it until the key is present.
 */
export function ClerkProviderGate({ children }: { children: ReactNode }) {
  const enabled = useClerkEnabled();

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      {children}
    </ClerkProvider>
  );
}

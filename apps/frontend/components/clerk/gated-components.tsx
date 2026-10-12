"use client";

import type { ReactNode } from "react";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import { useClerkEnabled } from "@/components/clerk-provider-gate";

/**
 * Clerk components that degrade gracefully when no Clerk publishable key is
 * configured. This keeps the app renderable (and buildable) before credentials
 * are supplied, while using the real Clerk UI as soon as they are present.
 */

export function GatedSignInButton({ children }: { children: ReactNode }) {
  const enabled = useClerkEnabled();
  if (!enabled) return null;
  return <SignInButton mode="modal">{children}</SignInButton>;
}

export function GatedSignUpButton({ children }: { children: ReactNode }) {
  const enabled = useClerkEnabled();
  if (!enabled) return null;
  return <SignUpButton mode="modal">{children}</SignUpButton>;
}

export function GatedSignedIn({ children }: { children: ReactNode }) {
  const enabled = useClerkEnabled();
  if (!enabled) return null;
  return <SignedIn>{children}</SignedIn>;
}

export function GatedSignedOut({ children }: { children: ReactNode }) {
  const enabled = useClerkEnabled();
  if (!enabled) return null;
  return <SignedOut>{children}</SignedOut>;
}

export function GatedUserButton() {
  const enabled = useClerkEnabled();
  if (!enabled) return null;
  return <UserButton />;
}

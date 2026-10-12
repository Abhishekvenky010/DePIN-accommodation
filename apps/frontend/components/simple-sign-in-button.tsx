"use client";

import { useAuth } from "@/components/simple-auth-provider";

export function GatedSignInButton({ children }: { children?: React.ReactNode }) {
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    return (
      <button className="px-4 py-2 bg-gray-800 text-white rounded">
        Dev User
      </button>
    );
  }

  return (
    <button
      onClick={() => {}}
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      {children || "Sign In (Dev)"}
    </button>
  );
}

export function GatedSignUpButton({ children }: { children?: React.ReactNode }) {
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    return (
      <button className="px-4 py-2 bg-gray-800 text-white rounded">
        Dev User
      </button>
    );
  }

  return (
    <button
      onClick={() => {}}
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      {children || "Sign Up (Dev)"}
    </button>
  );
}

export function GatedSignedIn({ children }: { children?: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  if (!isSignedIn) return null;
  return <>{children}</>;
}

export function GatedSignedOut({ children }: { children?: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  if (isSignedIn) return null;
  return <>{children}</>;
}

export function GatedUserButton() {
  const { isSignedIn } = useAuth();
  if (!isSignedIn) return null;
  return (
    <button className="px-4 py-2 bg-gray-800 text-white rounded">
      Dev User
    </button>
  );
}
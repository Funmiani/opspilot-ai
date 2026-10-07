"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signInWithGoogle, signOut } from "./client";

export function AuthButton({ logout = false }: { logout?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function act() {
    setPending(true); setError(false);
    try {
      const result = await (logout ? signOut() : signInWithGoogle());
      if (result.error) throw new Error("Authentication request failed.");
      if (logout) { router.replace("/sign-in"); router.refresh(); }
    } catch { setError(true); setPending(false); }
  }
  return <><button type="button" disabled={pending} onClick={act}>{pending ? "Please wait…" : logout ? "Sign out" : "Continue with Google"}</button>{error && <p role="alert">Unable to complete authentication. Please try again.</p>}</>;
}

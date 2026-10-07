"use client";
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient({ basePath: "/api/auth" });
export function signInWithGoogle() {
  return authClient.signIn.social({ provider: "google", callbackURL: "/app", newUserCallbackURL: "/app", errorCallbackURL: "/auth/error" });
}
export function signOut() { return authClient.signOut(); }

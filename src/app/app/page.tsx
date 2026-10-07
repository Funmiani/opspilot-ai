import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireApplicationIdentity } from "@/server/auth/session";
import { ApplicationError } from "@/server/application/errors";
import { AuthButton } from "@/features/auth/auth-button";
export default async function ApplicationPage() {
  try { await requireApplicationIdentity(await headers()); }
  catch (error) {
    if (error instanceof ApplicationError && error.code === "UNAUTHENTICATED") redirect("/sign-in");
    redirect("/auth/error");
  }
  return <main><h1>You are signed in to OpsPilot</h1><p>Workspace access is the next milestone.</p><Link href="/workspaces">Choose a workspace</Link><AuthButton logout /></main>;
}

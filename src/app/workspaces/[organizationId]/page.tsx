import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireApplicationIdentity } from "@/server/auth/session";
import { ApplicationError } from "@/server/application/errors";
import { resolveTrustedActorContext } from "@/features/workspaces/server/access";

export default async function WorkspacePage({ params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const identity = await requireApplicationIdentity(await headers());
    await resolveTrustedActorContext(identity, (await params).organizationId);
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "UNAUTHENTICATED") redirect("/sign-in");
    if (error instanceof ApplicationError && error.code === "FORBIDDEN") notFound();
    throw error;
  }
  return <main><h1>Workspace access verified</h1><Link href="/workspaces">Back to workspaces</Link></main>;
}

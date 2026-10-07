import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireApplicationIdentity } from "@/server/auth/session";
import { ApplicationError } from "@/server/application/errors";
import { listAccessibleWorkspaces } from "@/features/workspaces/server/access";

export default async function WorkspacesPage() {
  const identity = await requireApplicationIdentity(await headers()).catch(error => {
    if (error instanceof ApplicationError && error.code === "UNAUTHENTICATED") redirect("/sign-in");
    if (error instanceof ApplicationError && error.code === "FORBIDDEN") redirect("/auth/error");
    throw error;
  });
  const workspaces = await listAccessibleWorkspaces(identity);
  return <main><h1>Workspaces</h1>{workspaces.length === 0 ? <><h2>No workspace access</h2><p>Workspace access must be granted before you can continue.</p></> : <ul>{workspaces.map(workspace => <li key={workspace.organizationId}><Link href={`/workspaces/${workspace.organizationId}`}>{workspace.name}</Link></li>)}</ul>}<Link href="/app">Back to OpsPilot</Link></main>;
}

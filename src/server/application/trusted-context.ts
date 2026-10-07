import "server-only";

// Only a future verified authentication adapter may supply this context.
// The type itself does not authenticate a caller or authorize a tenant.
export type TrustedActorContext = Readonly<{
  actor: Readonly<{ userId: string }>;
  organizationId: string;
}>;

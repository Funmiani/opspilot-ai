import "server-only";

// Only verified server-side authentication and tenant resolution may supply this context.
// The type itself does not authenticate a caller or authorize a tenant.
export type TrustedActorContext = Readonly<{
  actor: Readonly<{ userId: string }>;
  organizationId: string;
}>;

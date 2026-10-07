import "server-only";

export function canCreateIncident(role: string): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

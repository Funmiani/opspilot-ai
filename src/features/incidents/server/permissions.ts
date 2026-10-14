import "server-only";

export function canCreateIncident(role: string): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

export function canReadIncident(role: string): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER" || role === "VIEWER";
}

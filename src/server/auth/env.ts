import "server-only";

export function readAuthEnv(env: Record<string, string | undefined> = process.env) {
  const secret = env.BETTER_AUTH_SECRET;
  // Matches Better Auth's length/entropy guidance; this cannot prove randomness.
  if (!secret || secret.length < 32 || /\s/.test(secret) ||
      secret.length * Math.log2(new Set(secret).size) < 120 ||
      /replace|placeholder|better-auth-secret/i.test(secret)) {
    throw new Error("BETTER_AUTH_SECRET must be a strong randomly generated secret of at least 32 characters.");
  }
  let url: URL;
  try { url = new URL(env.BETTER_AUTH_URL ?? ""); }
  catch { throw new Error("BETTER_AUTH_URL must be a valid canonical origin."); }
  const local = env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const rawURL = env.BETTER_AUTH_URL ?? "";
  if (![url.origin, `${url.origin}/`].includes(rawURL) || url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      /[?#]/.test(env.BETTER_AUTH_URL ?? "")) {
    throw new Error("BETTER_AUTH_URL must be an HTTPS origin (HTTP loopback is allowed in development), without credentials, path, query, or hash.");
  }
  const googleClientId = env.GOOGLE_CLIENT_ID;
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!googleClientId || !googleClientSecret ||
      [googleClientId, googleClientSecret].some(value => /replace|placeholder/i.test(value) || /\s/.test(value))) {
    throw new Error("Google OAuth server configuration is missing or invalid.");
  }
  return { secret, origin: url.origin, googleClientId, googleClientSecret };
}

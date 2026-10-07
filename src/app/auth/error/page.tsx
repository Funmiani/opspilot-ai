import Link from "next/link";
export default function AuthErrorPage() {
  return <main><h1>Authentication unavailable</h1><p>We could not complete your sign-in. Please try again or contact support.</p><Link href="/sign-in">Return to sign in</Link></main>;
}

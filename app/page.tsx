import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Mark } from "@/components/Mark";
import { currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Post-it",
  description: "A knowledge garden with real access control.",
};

export default async function Landing() {
  // The front page is for somebody who has not signed in. Somebody who has
  // came here to get to their work, so send them where signing in sends them,
  // rather than offering to sign them in again.
  if (await currentUser()) redirect("/spaces");

  return (
    <main className="soon">
      <div className="mark">
        <Mark size={72} />
      </div>

      <h1>Post-it</h1>
      <p className="tagline">A knowledge garden with real access control.</p>
      <p className="soon-signin">
        <Link href="/docs">Read the documentation</Link>
        <span aria-hidden="true">·</span>
        <Link href="/login">Sign in</Link>
      </p>

    </main>
  );
}

import Link from "next/link";
import { AuthForm } from "../AuthForm";
import { signIn } from "../actions";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "Sign in to Post-it" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  // Where the reader was going when they were asked to sign in, such as an
  // app asking for access to their Post-it. Only a path on this site.
  const destination = safeNext(next, "");

  return (
    <>
      <h1>Sign in</h1>

      {error === "link" ? (
        <p className="msg msg-error" role="alert">
          That link is no longer valid. Request a new one below.
        </p>
      ) : null}

      <AuthForm
        action={signIn}
        submitLabel="Sign in"
        hidden={destination ? { next: destination } : undefined}
        fields={[
          {
            name: "email",
            label: "Email",
            type: "email",
            autoComplete: "email",
          },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
      />

      <p className="auth-alt">
        <Link href="/forgot-password">Forgot your password?</Link>
        <span aria-hidden="true"> / </span>
        <Link href="/signup">Create an account</Link>
      </p>
    </>
  );
}

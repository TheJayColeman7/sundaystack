"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api("/api/auth/dev-login", {
        method: "POST",
        body: JSON.stringify({ email, displayName }),
      });
      router.push("/leagues");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm pt-10">
      <h1 className="text-xl font-semibold">Dev sign in</h1>
      <p className="mt-1 text-xs text-zinc-500">
        No password. Same user id shape as future Supabase Auth.
      </p>
      <form onSubmit={(event) => void submit(event)} className="mt-5 flex flex-col gap-3">
        <label className="text-xs text-zinc-400">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded border border-line bg-panel px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-turf"
          />
        </label>
        <label className="text-xs text-zinc-400">
          Display name
          <input
            required
            maxLength={40}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-1 w-full rounded border border-line bg-panel px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-turf"
          />
        </label>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-turf px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Continue"}
        </button>
      </form>
    </main>
  );
}

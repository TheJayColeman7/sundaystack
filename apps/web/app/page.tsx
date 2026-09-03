"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AuthUser } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";
import { FantasyHome } from "@/components/FantasyHome";

export default function HomePage() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  const markLoggedOut = useCallback(() => {
    setUser(null);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const result = await api<{ user: AuthUser }>("/api/me");
        setUser(result.user);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
          return;
        }
        setUser(null);
      }
    })();
  }, []);

  if (user === undefined) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  if (!user) {
    return (
      <main className="flex min-h-[70vh] flex-col justify-center gap-5">
        <h1 className="text-4xl font-semibold tracking-tight">SundayStack</h1>
        <p className="max-w-lg text-sm leading-6 text-muted">
          NFL fantasy football. Sign in to join a league or create one.
        </p>
        <Link
          href="/login"
          className="w-fit rounded bg-turf px-3 py-1.5 text-sm font-medium text-ink hover:bg-emerald-400"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return <FantasyHome onUnauthorized={markLoggedOut} />;
}

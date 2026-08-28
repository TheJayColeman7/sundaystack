"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const result = await api<{ user: AuthUser }>("/api/me");
      setUser(result.user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        return;
      }
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, pathname]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-ink text-zinc-100">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-ink/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-5">
          <Link href={user ? "/leagues" : "/"} className="text-sm font-semibold tracking-tight">
            SundayStack
          </Link>
          {user ? (
            <nav className="flex gap-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
              <Link href="/leagues" className="hover:text-turf">
                Leagues
              </Link>
            </nav>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {user === undefined ? (
            <span className="text-zinc-500">…</span>
          ) : user ? (
            <>
              <span className="hidden text-zinc-400 sm:inline">{user.displayName}</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded border border-line px-2 py-1 text-zinc-300 hover:border-turf hover:text-turf"
              >
                Log out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded border border-line px-2 py-1 text-zinc-300 hover:border-turf hover:text-turf"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-4 py-5">{children}</div>
    </div>
  );
}

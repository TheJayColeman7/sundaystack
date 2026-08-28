"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";
import {
  APPEARANCE_EVENT,
  applyJerseyTheme,
  cacheJerseyTheme,
  readCachedJerseyTheme,
  themeFromUser,
} from "@/lib/theme";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const result = await api<{ user: AuthUser }>("/api/me");
      setUser(result.user);
      applyJerseyTheme(themeFromUser(result.user));
      cacheJerseyTheme(result.user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        applyJerseyTheme(themeFromUser(null));
        cacheJerseyTheme(null);
        return;
      }
      setUser(null);
      applyJerseyTheme(themeFromUser(null));
      cacheJerseyTheme(null);
    }
  }, []);

  useEffect(() => {
    const cached = readCachedJerseyTheme();
    if (cached) {
      applyJerseyTheme(cached);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, pathname]);

  useEffect(() => {
    function onAppearance() {
      void load();
    }
    window.addEventListener(APPEARANCE_EVENT, onAppearance);
    return () => window.removeEventListener(APPEARANCE_EVENT, onAppearance);
  }, [load]);

  const onAccount = pathname === "/account";

  useEffect(() => {
    if (user === null && onAccount) {
      router.replace("/login");
    }
  }, [user, onAccount, router]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    applyJerseyTheme(themeFromUser(null));
    cacheJerseyTheme(null);
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-ink text-fg">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-ink/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-5">
          <Link href={user ? "/leagues" : "/"} className="text-sm font-semibold tracking-tight">
            SundayStack
          </Link>
          {user ? (
            <nav className="flex gap-3 text-xs font-medium uppercase tracking-wide text-muted">
              <Link href="/leagues" className="hover:text-turf">
                Leagues
              </Link>
              <Link href="/account" className="hover:text-turf">
                Account
              </Link>
            </nav>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {user === undefined ? (
            <span className="text-muted">…</span>
          ) : user ? (
            <>
              <Link href="/account" className="hidden items-center gap-2 text-muted hover:text-fg sm:flex">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : null}
                {user.displayName}
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded border border-line px-2 py-1 text-fg hover:border-turf hover:text-turf"
              >
                Log out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded border border-line px-2 py-1 text-fg hover:border-turf hover:text-turf"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-4 py-5">
        {onAccount && user === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : onAccount && !user ? null : (
          children
        )}
      </div>
    </div>
  );
}

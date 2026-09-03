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

function isDraftPath(pathname: string): boolean {
  return /\/leagues\/[^/]+\/draft\/?$/.test(pathname);
}

function isFantasyPath(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/leagues") || pathname.startsWith("/players");
}

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
  const onLogin = pathname === "/login";
  const onDraft = isDraftPath(pathname);
  const showMobileTabs = Boolean(user) && !onLogin && !onDraft;
  const fantasyActive = isFantasyPath(pathname);
  const accountActive = onAccount;

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
          <Link href="/" className="text-sm font-semibold tracking-tight">
            SundayStack
          </Link>
          {user ? (
            <nav className="hidden gap-3 text-xs font-medium uppercase tracking-wide text-muted md:flex">
              <Link href="/" className={`hover:text-turf ${fantasyActive && !accountActive ? "text-turf" : ""}`}>
                Leagues
              </Link>
              <Link href="/account" className={`hover:text-turf ${accountActive ? "text-turf" : ""}`}>
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
              <Link href="/account" className="hidden items-center gap-2 text-muted hover:text-fg md:flex">
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
      <div
        className={`mx-auto w-full max-w-5xl px-4 pt-5 ${
          showMobileTabs ? "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-5" : "pb-5"
        }`}
      >
        {onAccount && user === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : onAccount && !user ? null : (
          children
        )}
      </div>
      {showMobileTabs ? (
        <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className="mx-auto flex max-w-5xl">
            <Link
              href="/"
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium uppercase tracking-wide ${
                fantasyActive && !accountActive ? "text-turf" : "text-muted"
              }`}
            >
              Fantasy
            </Link>
            <Link
              href="/account"
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium uppercase tracking-wide ${
                accountActive ? "text-turf" : "text-muted"
              }`}
            >
              {user?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="mb-0.5 h-5 w-5 rounded-full object-cover" />
              ) : null}
              Account
            </Link>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

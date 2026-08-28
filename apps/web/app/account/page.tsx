"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AuthUser, JerseySide, NflTeamDto } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";
import { fileToAvatarDataUrl } from "@/lib/avatar";
import { applyJerseyTheme, notifyAppearanceChanged, themeFromUser } from "@/lib/theme";

export default function AccountPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [teams, setTeams] = useState<NflTeamDto[] | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [userRes, teamRes] = await Promise.all([
          api<{ user: AuthUser }>("/api/me"),
          api<{ data: NflTeamDto[] }>("/api/teams"),
        ]);
        setMe(userRes.user);
        setFirstName(userRes.user.firstName ?? (userRes.user.lastName ? "" : userRes.user.displayName));
        setLastName(userRes.user.lastName ?? "");
        setTeams(teamRes.data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load account");
        setTeams([]);
      }
    })();
  }, [router]);

  async function save(
    patch: {
      favoriteTeamId?: string | null;
      jerseySide?: JerseySide;
      firstName?: string | null;
      lastName?: string | null;
      avatarUrl?: string | null;
    },
    timeoutMs?: number,
  ) {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ user: AuthUser }>("/api/me", {
        method: "PATCH",
        body: JSON.stringify(patch),
        timeoutMs,
      });
      setMe(result.user);
      applyJerseyTheme(themeFromUser(result.user));
      notifyAppearanceChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  async function setSide(side: JerseySide) {
    if (!me?.favoriteTeam || me.jerseySide === side || pending) {
      return;
    }
    await save({ jerseySide: side });
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    await save({ firstName: firstName.trim() || null, lastName: lastName.trim() || null });
  }

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const avatarUrl = await fileToAvatarDataUrl(file);
      await save({ avatarUrl }, 20_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image");
    }
  }

  if (!me || !teams) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const selectedId = me.favoriteTeam?.id ?? null;
  const sideEnabled = Boolean(selectedId);
  const initials = [firstName, lastName]
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || me.displayName.slice(0, 2).toUpperCase();

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Account</h1>
        <p className="mt-1 text-xs text-muted">
          Your profile and jersey kit. Home uses your club&apos;s home colors; Away uses the road kit.
        </p>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <section>
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">Profile</h2>
        <form onSubmit={(event) => void saveProfile(event)} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-line bg-panel">
              {me.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-medium text-muted">
                  {initials || "?"}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(event) => void onPhoto(event)}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => fileRef.current?.click()}
                className="rounded border border-line px-3 py-1.5 text-xs hover:border-turf disabled:opacity-50"
              >
                {me.avatarUrl ? "Change photo" : "Add photo"}
              </button>
              {me.avatarUrl ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void save({ avatarUrl: null })}
                  className="text-left text-[11px] text-muted hover:text-fg disabled:opacity-50"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          <label className="flex max-w-md flex-col gap-2 text-xs text-muted">
            Email
            <input
              readOnly
              value={me.email}
              className="w-full rounded border border-line bg-panel px-2 py-1.5 text-sm text-muted outline-none"
            />
          </label>

          <div className="grid max-w-md gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted">
              First name
              <input
                value={firstName}
                maxLength={40}
                onChange={(event) => setFirstName(event.target.value)}
                className="mt-1 w-full rounded border border-line bg-ink px-2 py-1.5 text-sm text-fg outline-none focus:border-turf"
              />
            </label>
            <label className="text-xs text-muted">
              Last name
              <input
                value={lastName}
                maxLength={40}
                onChange={(event) => setLastName(event.target.value)}
                className="mt-1 w-full rounded border border-line bg-ink px-2 py-1.5 text-sm text-fg outline-none focus:border-turf"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-fit rounded bg-turf px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
          >
            Save profile
          </button>
        </form>

        <h3 className="mb-2 mt-6 text-[11px] font-medium uppercase tracking-wide text-muted">Jersey</h3>
        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="inline-flex rounded border border-line">
            {(["away", "home"] as const).map((side) => (
              <button
                key={side}
                type="button"
                disabled={!sideEnabled || pending}
                onClick={() => void setSide(side)}
                className={`px-3 py-1.5 text-xs font-medium capitalize disabled:opacity-40 ${
                  me.jerseySide === side && sideEnabled ? "bg-turf text-ink" : "text-muted hover:text-fg"
                }`}
              >
                {side}
              </button>
            ))}
          </fieldset>
          {selectedId ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void save({ favoriteTeamId: null })}
              className="text-xs text-muted hover:text-fg disabled:opacity-50"
            >
              Clear team
            </button>
          ) : (
            <span className="text-[11px] text-muted">Select a team to enable Home / Away</span>
          )}
        </div>

        <h3 className="mb-2 mt-6 text-[11px] font-medium uppercase tracking-wide text-muted">Favorite team</h3>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {teams.map((team) => {
            const selected = team.id === selectedId;
            return (
              <li key={team.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void save({ favoriteTeamId: team.id })}
                  className={`flex w-full items-center gap-2 rounded border px-2 py-2 text-left text-sm hover:border-turf disabled:opacity-50 ${
                    selected ? "border-turf bg-panel" : "border-line"
                  }`}
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-sm border border-line"
                    style={{ backgroundColor: team.primaryColor ?? "#3dd68c" }}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{team.abbreviation}</span>
                    <span className="block truncate text-[11px] text-muted">{team.name}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {teams.length === 0 ? <p className="text-xs text-muted">No NFL teams ingested yet.</p> : null}
      </section>
    </main>
  );
}

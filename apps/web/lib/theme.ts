import {
  NEUTRAL_HOME,
  resolveJerseyTheme,
  type AuthUser,
  type JerseyTheme,
} from "@sundaystack/shared";

export const APPEARANCE_EVENT = "ss-appearance";
const STORAGE_KEY = "ss_jersey_theme";

export function themeFromUser(user: AuthUser | null | undefined): JerseyTheme {
  if (!user?.favoriteTeam) {
    return NEUTRAL_HOME;
  }
  return resolveJerseyTheme(
    {
      abbreviation: user.favoriteTeam.abbreviation,
      primaryColor: user.favoriteTeam.primaryColor,
      secondaryColor: user.favoriteTeam.secondaryColor,
    },
    user.jerseySide,
  );
}

export function applyJerseyTheme(theme: JerseyTheme): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.style.setProperty("--ink", theme.ink);
  root.style.setProperty("--panel", theme.panel);
  root.style.setProperty("--line", theme.line);
  root.style.setProperty("--turf", theme.turf);
  root.style.setProperty("--fg", theme.fg);
  root.style.setProperty("--muted", theme.muted);
}

export function cacheJerseyTheme(user: AuthUser | null): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  if (!user?.favoriteTeam) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(themeFromUser(user)));
}

export function readCachedJerseyTheme(): JerseyTheme | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<JerseyTheme>;
    if (
      typeof parsed.ink !== "string" ||
      typeof parsed.panel !== "string" ||
      typeof parsed.line !== "string" ||
      typeof parsed.turf !== "string" ||
      typeof parsed.fg !== "string" ||
      typeof parsed.muted !== "string"
    ) {
      return null;
    }
    return {
      ink: parsed.ink,
      panel: parsed.panel,
      line: parsed.line,
      turf: parsed.turf,
      fg: parsed.fg,
      muted: parsed.muted,
    };
  } catch {
    return null;
  }
}

export function notifyAppearanceChanged(): void {
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

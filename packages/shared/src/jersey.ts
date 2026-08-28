export const JERSEY_SIDES = ["home", "away"] as const;

export type JerseySide = (typeof JERSEY_SIDES)[number];

export function isJerseySide(value: string): value is JerseySide {
  return (JERSEY_SIDES as readonly string[]).includes(value);
}

export interface TeamColorInput {
  abbreviation: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  tertiaryColor?: string | null;
}

/** RGB channels for Tailwind `rgb(var(--token) / <alpha-value>)`. */
export interface JerseyTheme {
  ink: string;
  panel: string;
  line: string;
  turf: string;
  fg: string;
  muted: string;
}

export const NEUTRAL_HOME: JerseyTheme = {
  ink: "12 16 22",
  panel: "21 27 36",
  line: "42 51 66",
  turf: "61 214 140",
  fg: "232 237 244",
  muted: "161 161 170",
};

const LIGHT_FIELD: JerseyTheme = {
  ink: "243 245 247",
  panel: "255 255 255",
  line: "208 213 221",
  turf: "61 214 140",
  fg: "12 16 22",
  muted: "90 98 112",
};

const DEFAULT_TURF: Rgb = [61, 214, 140];
const WHITE_HOME = new Set(["DAL"]);
const MIN_ACCENT_CONTRAST = 3;
const DARK_FIELD_MAX_LUMINANCE = 0.12;

type Rgb = [number, number, number];

export function formatHexColor(value: string | null | undefined): string | null {
  const rgb = parseHexColor(value);
  if (!rgb) {
    return null;
  }
  const hex = rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("");
  return `#${hex.toUpperCase()}`;
}

export function parseHexColor(value: string | null | undefined): Rgb | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const r = hex[0];
    const g = hex[1];
    const b = hex[2];
    if (!r || !g || !b) {
      return null;
    }
    return [Number.parseInt(r + r, 16), Number.parseInt(g + g, 16), Number.parseInt(b + b, 16)];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function rgbString(rgb: Rgb): string {
  return `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [
    clampChannel(from[0] + (to[0] - from[0]) * amount),
    clampChannel(from[1] + (to[1] - from[1]) * amount),
    clampChannel(from[2] + (to[2] - from[2]) * amount),
  ];
}

function relativeLuminance(rgb: Rgb): number {
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrastRatio(left: Rgb, right: Rgb): number {
  const a = relativeLuminance(left);
  const b = relativeLuminance(right);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function darkenTo(rgb: Rgb, maxLuminance: number): Rgb {
  let current = rgb;
  for (let step = 0; step < 24 && relativeLuminance(current) > maxLuminance; step += 1) {
    current = mix(current, [0, 0, 0], 0.18);
  }
  return current;
}

function lighten(rgb: Rgb, amount: number): Rgb {
  return mix(rgb, [255, 255, 255], amount);
}

function parseRgbString(value: string): Rgb {
  const parts = value.split(" ").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function ensureAccent(color: Rgb, field: Rgb): Rgb {
  let current = color;
  const fieldIsLight = relativeLuminance(field) > 0.5;
  const toward: Rgb = fieldIsLight ? [0, 0, 0] : [255, 255, 255];
  for (let step = 0; step < 16 && contrastRatio(current, field) < MIN_ACCENT_CONTRAST; step += 1) {
    current = mix(current, toward, 0.12);
  }
  if (contrastRatio(current, field) >= MIN_ACCENT_CONTRAST) {
    return current;
  }
  return DEFAULT_TURF;
}

function pickAccent(candidates: Array<Rgb | null>, field: Rgb): Rgb {
  for (const candidate of candidates) {
    if (candidate) {
      return ensureAccent(candidate, field);
    }
  }
  return DEFAULT_TURF;
}

function lightKit(primary: Rgb, secondary: Rgb | null): JerseyTheme {
  const ink = parseRgbString(LIGHT_FIELD.ink);
  const line = mix(parseRgbString(LIGHT_FIELD.line), primary, 0.35);
  const turf = pickAccent([primary, secondary], ink);
  return {
    ...LIGHT_FIELD,
    line: rgbString(line),
    turf: rgbString(turf),
  };
}

function darkKit(primary: Rgb, secondary: Rgb | null): JerseyTheme {
  const ink = darkenTo(primary, DARK_FIELD_MAX_LUMINANCE);
  const panel = mix(ink, [255, 255, 255], 0.08);
  const line = mix(ink, primary, 0.28);
  const turf = pickAccent([secondary, lighten(primary, 0.35), primary], ink);
  return {
    ink: rgbString(ink),
    panel: rgbString(panel),
    line: rgbString(line),
    turf: rgbString(turf),
    fg: NEUTRAL_HOME.fg,
    muted: NEUTRAL_HOME.muted,
  };
}

/**
 * Accent-driven Home/Away kit. No favorite team → always SundayStack dark.
 * DAL home is the white jersey (light field); other clubs home is the color jersey.
 */
export function resolveJerseyTheme(team: TeamColorInput | null, side: JerseySide): JerseyTheme {
  if (!team) {
    return NEUTRAL_HOME;
  }
  const primary = parseHexColor(team.primaryColor);
  if (!primary) {
    return NEUTRAL_HOME;
  }
  const secondary = parseHexColor(team.secondaryColor);
  const whiteHome = WHITE_HOME.has(team.abbreviation.toUpperCase());
  const lightField = whiteHome ? side === "home" : side === "away";
  return lightField ? lightKit(primary, secondary) : darkKit(primary, secondary);
}

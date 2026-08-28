import { describe, expect, it } from "vitest";
import { NEUTRAL_HOME, parseHexColor, resolveJerseyTheme } from "./jersey";

function luminance(channels: string): number {
  const parts = channels.split(" ").map(Number);
  const lin = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(parts[0] ?? 0) + 0.7152 * lin(parts[1] ?? 0) + 0.0722 * lin(parts[2] ?? 0);
}

const KC = { abbreviation: "KC", primaryColor: "#E31837", secondaryColor: "#FFB81C" };
const DAL = { abbreviation: "DAL", primaryColor: "#002244", secondaryColor: "#B0B7BC" };

describe("parseHexColor", () => {
  it("accepts #RRGGBB", () => {
    expect(parseHexColor("#E31837")).toEqual([227, 24, 55]);
  });

  it("returns null for junk", () => {
    expect(parseHexColor("nope")).toBeNull();
    expect(parseHexColor("")).toBeNull();
  });
});

describe("resolveJerseyTheme", () => {
  it("KC home is a dark field with a gold-leaning accent", () => {
    const theme = resolveJerseyTheme(KC, "home");
    expect(luminance(theme.ink)).toBeLessThan(0.15);
    const [r, g] = theme.turf.split(" ").map(Number);
    expect(r ?? 0).toBeGreaterThan(180);
    expect(g ?? 0).toBeGreaterThan(140);
  });

  it("KC away is a light field with a red accent", () => {
    const theme = resolveJerseyTheme(KC, "away");
    expect(luminance(theme.ink)).toBeGreaterThan(0.7);
    const [r, g, b] = theme.turf.split(" ").map(Number);
    expect(r ?? 0).toBeGreaterThan(g ?? 0);
    expect(r ?? 0).toBeGreaterThan(b ?? 0);
  });

  it("DAL home is the white jersey (light field)", () => {
    const theme = resolveJerseyTheme(DAL, "home");
    expect(luminance(theme.ink)).toBeGreaterThan(0.7);
  });

  it("null team is always SundayStack dark", () => {
    expect(resolveJerseyTheme(null, "home")).toEqual(NEUTRAL_HOME);
    expect(resolveJerseyTheme(null, "away")).toEqual(NEUTRAL_HOME);
  });

  it("ignores bad primary hex", () => {
    expect(
      resolveJerseyTheme({ abbreviation: "KC", primaryColor: "nope", secondaryColor: "#FFB81C" }, "home"),
    ).toEqual(NEUTRAL_HOME);
  });
});

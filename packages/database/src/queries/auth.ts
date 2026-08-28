import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { isJerseySide, type AuthUser, type JerseySide } from "@sundaystack/shared";
import type { Database } from "../client";
import { authUsers, teams, users } from "../schema";
import { getCurrentNflTeam } from "./teams";

export class ProfileError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ProfileError";
  }
}

const MAX_AVATAR_CHARS = 350_000;
const AVATAR_DATA = /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i;
const AVATAR_HTTP = /^https:\/\//i;

function assertAvatarUrl(value: string): void {
  if (value.length > MAX_AVATAR_CHARS) {
    throw new ProfileError("Profile photo is too large", 400, "AVATAR_TOO_LARGE");
  }
  if (AVATAR_DATA.test(value) || AVATAR_HTTP.test(value)) {
    return;
  }
  throw new ProfileError("Profile photo must be an image or https URL", 400, "INVALID_AVATAR");
}

function joinedDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback: string,
): string {
  const joined = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim();
  return joined || fallback;
}

export interface DevUser {
  id: string;
  email: string;
  displayName: string;
}

export async function upsertDevUser(
  db: Database,
  email: string,
  displayName: string,
): Promise<DevUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: authUsers.id, email: authUsers.email })
    .from(authUsers)
    .where(eq(authUsers.email, normalizedEmail))
    .limit(1);

  if (existing) {
    const [profile] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, existing.id))
      .limit(1);
    return {
      id: existing.id,
      email: existing.email ?? normalizedEmail,
      displayName: profile?.displayName ?? displayName,
    };
  }

  const id = randomUUID();
  await db.insert(authUsers).values({ id, email: normalizedEmail });
  await db
    .insert(users)
    .values({ id, displayName, firstName: displayName })
    .onConflictDoUpdate({
      target: users.id,
      set: { displayName, firstName: displayName, updatedAt: new Date() },
    });

  return { id, email: normalizedEmail, displayName };
}

export async function getUserById(db: Database, userId: string): Promise<AuthUser | null> {
  const [profile] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
      jerseySide: users.jerseySide,
      favoriteTeamId: users.favoriteTeamId,
      teamId: teams.id,
      teamAbbreviation: teams.abbreviation,
      teamName: teams.name,
      primaryColor: teams.primaryColor,
      secondaryColor: teams.secondaryColor,
    })
    .from(users)
    .leftJoin(teams, eq(users.favoriteTeamId, teams.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!profile) {
    return null;
  }

  const [auth] = await db
    .select({ email: authUsers.email })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);

  return {
    id: profile.id,
    email: auth?.email ?? "",
    displayName: profile.displayName ?? "",
    firstName: profile.firstName,
    lastName: profile.lastName,
    avatarUrl: profile.avatarUrl,
    jerseySide: isJerseySide(profile.jerseySide) ? profile.jerseySide : "home",
    favoriteTeam:
      profile.favoriteTeamId && profile.teamId && profile.teamAbbreviation && profile.teamName
        ? {
            id: profile.teamId,
            abbreviation: profile.teamAbbreviation,
            name: profile.teamName,
            primaryColor: profile.primaryColor,
            secondaryColor: profile.secondaryColor,
          }
        : null,
  };
}

export async function patchUserAppearance(
  db: Database,
  userId: string,
  patch: {
    favoriteTeamId?: string | null;
    jerseySide?: JerseySide;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
  },
): Promise<AuthUser> {
  if (patch.favoriteTeamId) {
    const team = await getCurrentNflTeam(db, patch.favoriteTeamId);
    if (!team) {
      throw new ProfileError("Favorite team must be a current NFL franchise", 400, "INVALID_TEAM");
    }
  }
  if (patch.avatarUrl) {
    assertAvatarUrl(patch.avatarUrl);
  }

  const current = await getUserById(db, userId);
  if (!current) {
    throw new ProfileError("User not found", 401);
  }

  const firstName = patch.firstName !== undefined ? patch.firstName : current.firstName;
  const lastName = patch.lastName !== undefined ? patch.lastName : current.lastName;
  const displayName =
    patch.firstName !== undefined || patch.lastName !== undefined
      ? joinedDisplayName(firstName, lastName, current.displayName)
      : current.displayName;

  await db
    .update(users)
    .set({
      ...(patch.favoriteTeamId !== undefined ? { favoriteTeamId: patch.favoriteTeamId } : {}),
      ...(patch.jerseySide !== undefined ? { jerseySide: patch.jerseySide } : {}),
      ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
      ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
      ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
      ...(patch.firstName !== undefined || patch.lastName !== undefined ? { displayName } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  const user = await getUserById(db, userId);
  if (!user) {
    throw new ProfileError("User not found", 401);
  }
  return user;
}

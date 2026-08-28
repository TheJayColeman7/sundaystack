import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { authUsers, users } from "../schema";

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
    await db
      .update(users)
      .set({ displayName, updatedAt: new Date() })
      .where(eq(users.id, existing.id));
    return {
      id: existing.id,
      email: existing.email ?? normalizedEmail,
      displayName,
    };
  }

  const id = randomUUID();
  await db.insert(authUsers).values({ id, email: normalizedEmail });
  await db
    .insert(users)
    .values({ id, displayName })
    .onConflictDoUpdate({
      target: users.id,
      set: { displayName, updatedAt: new Date() },
    });

  return { id, email: normalizedEmail, displayName };
}

export async function getUserById(db: Database, userId: string): Promise<DevUser | null> {
  const [profile] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
    })
    .from(users)
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
  };
}

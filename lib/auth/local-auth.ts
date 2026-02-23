/**
 * Authentication system for Seline Web SaaS.
 */

import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface LocalUser {
  id: string;
  email: string;
}

// Cookie name for session storage
export const SESSION_COOKIE_NAME = "seline-session";

/**
 * Create a new user with password
 */
export async function createLocalUser(
  email: string,
  password: string
): Promise<LocalUser> {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existingUser) {
    throw new Error("Email already registered");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [newUser] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
    })
    .returning();

  return { id: newUser.id, email: newUser.email };
}

/**
 * Authenticate a user with email and password
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<LocalUser | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user || !user.passwordHash) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  return { id: user.id, email: user.email };
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<LocalUser | null> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
    };
  } catch (err) {
    console.error("[Auth] getUserById error:", err);
    return null;
  }
}

/**
 * Check if any users exist in the database
 */
export async function hasAnyUsers(): Promise<boolean> {
  const user = await db.query.users.findFirst();
  return !!user;
}

/**
 * Parse session cookie from request headers
 */
export function parseSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split("=");
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  return cookies[SESSION_COOKIE_NAME] || null;
}

/**
 * Get current user ID from session (for use in API routes)
 */
export async function requireAuth(request?: Request): Promise<string> {
  const cookieHeader = request?.headers.get("cookie");
  const sessionId = parseSessionCookie(cookieHeader || null);

  if (!sessionId) {
    throw new Error("Unauthorized");
  }

  const user = await getUserById(sessionId);
  if (!user) {
    throw new Error("Invalid session");
  }

  return user.id;
}

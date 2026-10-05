import { and, desc, eq } from "drizzle-orm";
import { agentTokens } from "../../../db/schema";
import { nowIso } from "../../../shared/time";
import type { Db } from "../db";
import { notFound } from "../errors";

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function hashToken(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `lb_${b64}`;
}

export async function listAgentTokens(db: Db, userId: string) {
  return db
    .select({ id: agentTokens.id, name: agentTokens.name, createdAt: agentTokens.createdAt, lastUsedAt: agentTokens.lastUsedAt })
    .from(agentTokens)
    .where(eq(agentTokens.userId, userId))
    .orderBy(desc(agentTokens.createdAt));
}

/** Returns the plain token exactly once; only its hash is stored. */
export async function createAgentToken(db: Db, userId: string, name: string) {
  const token = newToken();
  const row = { id: crypto.randomUUID(), userId, name, tokenHash: await hashToken(token), createdAt: nowIso(), lastUsedAt: null };
  await db.insert(agentTokens).values(row);
  return { id: row.id, name, createdAt: row.createdAt, token };
}

export async function revokeAgentToken(db: Db, userId: string, id: string) {
  const row = await db
    .delete(agentTokens)
    .where(and(eq(agentTokens.id, id), eq(agentTokens.userId, userId)))
    .returning({ id: agentTokens.id })
    .get();
  if (!row) throw notFound("Token");
}

/** Finds the owner of a presented token, or null. Records use at most every 10 minutes. */
export async function userForAgentToken(db: Db, token: string) {
  const row = await db
    .select({ id: agentTokens.id, userId: agentTokens.userId, lastUsedAt: agentTokens.lastUsedAt })
    .from(agentTokens)
    .where(eq(agentTokens.tokenHash, await hashToken(token)))
    .get();
  if (!row) return null;
  const now = Date.now();
  if (!row.lastUsedAt || now - new Date(row.lastUsedAt).getTime() > 10 * 60_000) {
    await db.update(agentTokens).set({ lastUsedAt: new Date(now).toISOString() }).where(eq(agentTokens.id, row.id));
  }
  return row.userId;
}

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { projects, shippedEvents } from "../../../db/schema";
import {
  MAX_ACTIVE_PROJECTS,
  normalizeName,
  type CreateProjectInput,
  type Project,
  type ProjectRecord,
  type ShipResult,
  type UpdateProjectInput,
} from "../../../shared/schemas";
import { isStale, nowIso } from "../../../shared/time";
import type { Db } from "../db";
import { ApiError, notFound } from "../errors";

type Row = typeof projects.$inferSelect;

const STATUS_ORDER = sql`case ${projects.status} when 'active' then 0 when 'parked' then 1 else 2 end`;

/** API shape: the stored record without its owner, plus the derived `stale` flag. */
export function toProject(row: Row | ProjectRecord, now = new Date()): Project {
  const { userId: _owner, ...record } = row as Row;
  return { ...record, stale: isStale(row.lastTouched, now) };
}

const mine = (userId: string) => eq(projects.userId, userId);

export async function listProjects(db: Db, userId: string): Promise<Project[]> {
  const rows = await db.select().from(projects).where(mine(userId)).orderBy(STATUS_ORDER, desc(projects.lastTouched));
  const now = new Date();
  return rows.map((r) => toProject(r, now));
}

async function getRow(db: Db, userId: string, id: string): Promise<Row> {
  const row = await db.select().from(projects).where(and(eq(projects.id, id), mine(userId))).get();
  if (!row) throw notFound("Project");
  return row;
}

/**
 * Finds one of the user's projects by id, or by name ignoring case and extra spaces.
 * Voice assistants say names, so agent routes accept either.
 */
export async function resolveProjectRef(db: Db, userId: string, ref: string): Promise<Row> {
  const all = await db.select().from(projects).where(mine(userId));
  const byId = all.find((p) => p.id === ref);
  if (byId) return byId;
  const wanted = normalizeName(ref);
  const match = all.find((p) => normalizeName(p.name) === wanted);
  if (!match) throw new ApiError(404, "not_found", `No project named "${ref}"`);
  return match;
}

async function assertNameFree(db: Db, userId: string, name: string, exceptId?: string) {
  const wanted = normalizeName(name);
  const rows = await db.select({ id: projects.id, name: projects.name }).from(projects).where(mine(userId));
  const clash = rows.find((r) => r.id !== exceptId && normalizeName(r.name) === wanted);
  if (clash) throw new ApiError(409, "name_taken", `A project named "${clash.name}" already exists`);
}

async function assertActiveSlot(db: Db, userId: string, exceptId?: string) {
  const where = exceptId
    ? and(mine(userId), eq(projects.status, "active"), ne(projects.id, exceptId))
    : and(mine(userId), eq(projects.status, "active"));
  const active = await db.select({ name: projects.name }).from(projects).where(where);
  if (active.length >= MAX_ACTIVE_PROJECTS) {
    const names = active.map((p) => p.name).join(" and ");
    throw new ApiError(
      409,
      "active_limit",
      `Only ${MAX_ACTIVE_PROJECTS} projects can be active. Park ${names} first, or park this one.`,
    );
  }
}

export async function createProject(db: Db, userId: string, input: CreateProjectInput): Promise<Project> {
  const status = input.status ?? "parked";
  await assertNameFree(db, userId, input.name);
  if (status === "active") await assertActiveSlot(db, userId);
  const now = nowIso();
  const row: Row = {
    id: crypto.randomUUID(),
    userId,
    name: input.name,
    status,
    nextAction: input.nextAction,
    doneDefinition: input.doneDefinition ?? "",
    lastTouched: now,
    createdAt: now,
  };
  await db.insert(projects).values(row);
  return toProject(row);
}

/** Applies a partial update. Every update, even an empty one, refreshes last_touched. */
export async function updateProject(db: Db, userId: string, id: string, patch: UpdateProjectInput): Promise<Project> {
  const existing = await getRow(db, userId, id);
  if (patch.name !== undefined && normalizeName(patch.name) !== normalizeName(existing.name)) {
    await assertNameFree(db, userId, patch.name, id);
  }
  if (patch.status === "active" && existing.status !== "active") {
    await assertActiveSlot(db, userId, id);
  }
  const updated = await db
    .update(projects)
    .set({ ...patch, lastTouched: nowIso() })
    .where(and(eq(projects.id, id), mine(userId)))
    .returning()
    .get();
  return toProject(updated!);
}

/** Records a shipped event and touches the project, atomically. */
export async function shipProject(db: Db, userId: string, id: string, note?: string | null): Promise<ShipResult> {
  await getRow(db, userId, id);
  const now = nowIso();
  const event = { id: crypto.randomUUID(), projectId: id, note: note?.trim() || null, shippedAt: now };
  const [, updated] = await db.batch([
    db.insert(shippedEvents).values({ ...event, userId }),
    db
      .update(projects)
      .set({ lastTouched: now })
      .where(and(eq(projects.id, id), mine(userId)))
      .returning(),
  ]);
  return { project: toProject(updated[0]), event };
}

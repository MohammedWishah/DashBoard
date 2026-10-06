// Proves users can't see or touch each other's data.
// Run with the local API up (`npm run dev:api`) and SUPABASE_JWT_SECRET set in .dev.vars:
//   node scripts/isolation-check.mjs
// It mints HS256 tokens like Supabase would, for the owner and a second user.
import { readFileSync } from "node:fs";
import { SignJWT } from "jose";

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const BASE = process.env.BASE ?? "http://127.0.0.1:8788/api";
const secret = new TextEncoder().encode(vars.SUPABASE_JWT_SECRET);
if (!vars.SUPABASE_JWT_SECRET) throw new Error("Set SUPABASE_JWT_SECRET in .dev.vars");

async function token(sub, email, overrides = {}) {
  return new SignJWT({ email, role: "authenticated", ...overrides.claims })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(overrides.iss ?? `${vars.SUPABASE_URL}/auth/v1`)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? "1h")
    .sign(overrides.secret ?? secret);
}

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
};
const periodMonday = (date) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

function client(bearer) {
  return async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

const run = Date.now().toString(36);
// Stable owner id so re-runs behave the same; Bob is new every run.
const owner = client(await token("owner-local", vars.OWNER_EMAIL || "owner@example.test"));
const bob = client(await token(`bob-${run}`, `bob-${run}@example.test`));

// ---- auth basics
check("no token -> 401", (await fetch(`${BASE}/projects`)).status === 401);
check("wrong secret -> 401", (await client(await token("x", "x@x.test", { secret: new TextEncoder().encode("nope") }))("GET", "/projects")).status === 401);
check("wrong issuer -> 401", (await client(await token("x", "x@x.test", { iss: "https://evil.example/auth/v1" }))("GET", "/projects")).status === 401);
check("expired -> 401", (await client(await token("x", "x@x.test", { exp: Math.floor(Date.now() / 1000) - 60 }))("GET", "/projects")).status === 401);
const bobMe = (await bob("GET", "/me")).body;
check("/me returns the caller", bobMe?.email === `bob-${run}@example.test`);

// ---- roles: the owner is admin; new people get Money + Planner only
const ownerMe = (await owner("GET", "/me")).body;
check("owner is admin with every feature", ownerMe.isAdmin === true && ownerMe.features.length === 3, JSON.stringify(ownerMe));
check("new person gets money + planner", !bobMe.isAdmin && JSON.stringify(bobMe.features) === JSON.stringify(["money", "planner"]), JSON.stringify(bobMe));
check("Projects blocked until granted (403)", (await bob("GET", "/projects")).status === 403);
check("non-admin can't list people (403)", (await bob("GET", "/admin/users")).status === 403);
check("non-admin can't grant themselves (403)", (await bob("PATCH", `/admin/users/${bobMe.id}`, { features: ["projects"] })).status === 403);
const people = (await owner("GET", "/admin/users")).body.users;
check("admin sees Bob in the people list", people.some((u) => u.id === bobMe.id));
check("admin can't change their own features (400)", (await owner("PATCH", `/admin/users/${ownerMe.id}`, { features: [] })).status === 400);
check("unknown feature rejected (400)", (await owner("PATCH", `/admin/users/${bobMe.id}`, { features: ["root"] })).status === 400);
const grant = await owner("PATCH", `/admin/users/${bobMe.id}`, { features: ["money", "planner", "projects"] });
check("admin grants Bob Projects", grant.status === 200 && grant.body.user.features.includes("projects"));
check("grant applies immediately", (await bob("GET", "/projects")).status === 200);

// ---- the owner received the data from before multi-user
const ownerStart = (await owner("GET", "/projects")).body.projects;
check("owner claimed legacy projects", ownerStart.some((p) => p.name === "Synth Firmware"), JSON.stringify(ownerStart.map((p) => p.name)));

// ---- new user starts empty, with starter categories
const bobProjects = await bob("GET", "/projects");
check("new user has no projects", bobProjects.status === 200 && bobProjects.body.projects.length === 0);
const bobCats = (await bob("GET", "/money/categories")).body.categories;
check("new user gets 6 starter categories", bobCats.length === 6, JSON.stringify(bobCats?.map((c) => c.name)));

// ---- each user creates data with the same names
const ownerProj = await owner("POST", "/projects", { name: `Shared Name ${run}`, nextAction: "Owner step", status: "parked" });
const bobProj = await bob("POST", "/projects", { name: `Shared Name ${run}`, nextAction: "Bob step", status: "active" });
check("same project name allowed for two users", ownerProj.status === 201 && bobProj.status === 201, `${ownerProj.status}/${bobProj.status}`);

const ownerCat = await owner("POST", "/money/categories", { name: `Hobby ${run}` });
const bobCat = await bob("POST", "/money/categories", { name: `Hobby ${run}` });
const ownerOnlyCat = await owner("POST", "/money/categories", { name: `OwnerOnly ${run}` });
check("same category name allowed for two users", ownerCat.status === 201 && bobCat.status === 201);

const ownerExpense = await owner("POST", "/money/expenses", { categoryId: ownerCat.body.category.id, amountCents: 1234, spentOn: "2026-10-02" });
const ownerGoal = await owner("POST", "/money/goals", { name: "Owner goal", targetCents: 50000 });
const ownerDebt = await owner("POST", "/money/debts", { name: "Owner debt", startingBalanceCents: 90000, startedOn: "2026-09-01" });
const ownerBill = await owner("POST", "/money/bills", { name: "Owner bill", categoryId: ownerCat.body.category.id, amountCents: 999, dayOfMonth: 1, startsOn: "2026-09-01" });

// ---- Bob can't see the owner's data
const bobList = (await bob("GET", "/projects")).body.projects;
check("Bob sees only his own project", bobList.length === 1 && bobList[0].nextAction === "Bob step");
const bobOverview = (await bob("GET", "/money/overview?month=2026-10")).body;
check("Bob's overview has none of the owner's money", bobOverview.totals.expenseCents === 0 && bobOverview.goals.length === 0 && bobOverview.debts.length === 0 && bobOverview.bills.length === 0);
const bobExport = (await bob("GET", "/export")).body;
check("Bob's export holds only Bob's rows", bobExport.projects.length === 1 && bobExport.money.expenses.length === 0 && !JSON.stringify(bobExport).includes("Owner"));

// ---- Bob can't touch the owner's rows by id (all 404)
const pid = ownerProj.body.project.id;
const attempts = [
  ["PATCH project", () => bob("PATCH", `/projects/${pid}`, { nextAction: "hacked" })],
  ["ship project", () => bob("POST", `/projects/${pid}/ship`, {})],
  ["PATCH category", () => bob("PATCH", `/money/categories/${ownerCat.body.category.id}`, { name: "hacked" })],
  ["DELETE category", () => bob("DELETE", `/money/categories/${ownerCat.body.category.id}`)],
  ["expense into owner's category", () => bob("POST", "/money/expenses", { categoryId: ownerCat.body.category.id, amountCents: 1, spentOn: "2026-10-02" })],
  ["PATCH expense", () => bob("PATCH", `/money/expenses/${ownerExpense.body.expense.id}`, { amountCents: 1 })],
  ["DELETE expense", () => bob("DELETE", `/money/expenses/${ownerExpense.body.expense.id}`)],
  ["PATCH bill", () => bob("PATCH", `/money/bills/${ownerBill.body.bill.id}`, { amountCents: 1 })],
  ["DELETE bill", () => bob("DELETE", `/money/bills/${ownerBill.body.bill.id}`)],
  ["contribute to goal", () => bob("POST", `/money/goals/${ownerGoal.body.goal.id}/contributions`, { amountCents: 100, onDate: "2026-10-02" })],
  ["DELETE goal", () => bob("DELETE", `/money/goals/${ownerGoal.body.goal.id}`)],
  ["pay debt", () => bob("POST", `/money/debts/${ownerDebt.body.debt.id}/payments`, { amountCents: 100, paidOn: "2026-10-02" })],
  ["DELETE debt", () => bob("DELETE", `/money/debts/${ownerDebt.body.debt.id}`)],
];
for (const [name, fn] of attempts) {
  const r = await fn();
  check(`Bob can't ${name} (404)`, r.status === 404, `got ${r.status}`);
}
const ownerAfter = (await owner("GET", "/projects")).body.projects.find((p) => p.id === pid);
check("owner's project unchanged", ownerAfter?.nextAction === "Owner step");
const ownerOverview = (await owner("GET", "/money/overview?month=2026-10")).body;
check("owner's goal and debt untouched", ownerOverview.goals.some((g) => g.name === "Owner goal" && g.savedCents === 0) && ownerOverview.debts.some((d) => d.name === "Owner debt" && d.paidCents === 0));

// ---- the 2-active limit is per user
const bob2 = await bob("POST", "/projects", { name: `B2 ${run}`, nextAction: "x", status: "active" });
const bob3 = await bob("POST", "/projects", { name: `B3 ${run}`, nextAction: "x", status: "active" });
check("Bob's own active limit applies", bob2.status === 201 && bob3.status === 409, `${bob2.status}/${bob3.status}`);

// ---- planner (browser)
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
const ownerHabit = await owner("POST", "/planner/habits", { name: `Read ${run}`, frequency: "daily" });
check("owner creates a habit", ownerHabit.status === 201, JSON.stringify(ownerHabit.body));
const bobGym = await bob("POST", "/planner/habits", { name: "Gym", frequency: "weekly" });
const bobRead = await bob("POST", "/planner/habits", { name: `Read ${run}`, frequency: "daily" });
check("same habit name allowed for two users", bobGym.status === 201 && bobRead.status === 201);
check("name clash ignores case and frequency (409)", (await bob("POST", "/planner/habits", { name: " gym ", frequency: "daily" })).status === 409);
check("rename into a clash (409)", (await bob("PATCH", `/planner/habits/${bobRead.body.habit.id}`, { name: "GYM" })).status === 409);
const oh = ownerHabit.body.habit.id;
const tick = await owner("PUT", `/planner/habits/${oh}/checks/${today}`);
check("owner ticks today", tick.status === 200 && tick.body.checked === true, JSON.stringify(tick.body));
check("ticking twice is a no-op (200)", (await owner("PUT", `/planner/habits/${oh}/checks/${today}`)).status === 200);
check("future tick rejected (400)", (await owner("PUT", `/planner/habits/${oh}/checks/${tomorrow}`)).status === 400);
check("wrong period key for weekly rejected (400)", (await bob("PUT", `/planner/habits/${bobGym.body.habit.id}/checks/2026-10-06`)).status === 400);
const ownerDay = (await owner("GET", `/planner/day?date=${today}`)).body;
check("owner's day shows the tick and a streak", ownerDay.habits.daily.some((h) => h.id === oh && h.checked && h.streak >= 1), JSON.stringify(ownerDay.habits.daily));
const put = await owner("PUT", `/planner/day/${today}/tasks`, { tasks: [{ text: "Owner task" }, { text: "Second", done: true }] });
check("owner sets top 3", put.status === 200 && put.body.tasks.length === 2 && put.body.tasks[1].position === 2, JSON.stringify(put.body));
check("4 tasks rejected (400)", (await owner("PUT", `/planner/day/${today}/tasks`, { tasks: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }] })).status === 400);
const ownerTaskId = put.body.tasks[0].id;
// Bob can't see or touch any of it
const bobDay = (await bob("GET", `/planner/day?date=${today}`)).body;
check("Bob's day has none of the owner's tasks or habits", bobDay.tasks.length === 0 && !JSON.stringify(bobDay).includes(oh));
for (const [name, fn] of [
  ["tick owner's habit", () => bob("PUT", `/planner/habits/${oh}/checks/${today}`)],
  ["untick owner's habit", () => bob("DELETE", `/planner/habits/${oh}/checks/${today}`)],
  ["rename owner's habit", () => bob("PATCH", `/planner/habits/${oh}`, { name: "hacked" })],
  ["delete owner's habit", () => bob("DELETE", `/planner/habits/${oh}`)],
  ["edit owner's task", () => bob("PATCH", `/planner/tasks/${ownerTaskId}`, { done: true })],
]) {
  const r = await fn();
  check(`Bob can't ${name} (404)`, r.status === 404, `got ${r.status}`);
}
const ownerMonth = (await owner("GET", `/planner/month?month=${today.slice(0, 7)}`)).body;
check("owner's month has the tick", ownerMonth.daily.some((r) => r.habit.id === oh && r.checks.includes(today)), JSON.stringify(ownerMonth.daily));
check("unticking twice is a no-op (200)", (await owner("DELETE", `/planner/habits/${oh}/checks/${today}`)).status === 200 && (await owner("DELETE", `/planner/habits/${oh}/checks/${today}`)).status === 200);
check("owner's task untouched", (await owner("GET", `/planner/day?date=${today}`)).body.tasks[0].done === false);
check("empty top 3 clears the day", (await owner("PUT", `/planner/day/${today}/tasks`, { tasks: [] })).body.tasks.length === 0);

// ---- agent tokens reach only their owner
const tok = await bob("POST", "/agent-tokens", { name: "Bob's speaker" });
check("token created once with lb_ prefix", tok.status === 201 && /^lb_/.test(tok.body.token));
const agent = client(tok.body.token);
const agentProjects = (await agent("GET", "/agent/projects")).body.projects;
check("Bob's agent sees only Bob's projects", agentProjects.length === 2 && agentProjects.every((p) => !p.nextAction.startsWith("Owner")));
check("Bob's agent can't ship owner's project", (await agent("POST", `/agent/projects/${pid}/ship`, {})).status === 404);
check("agent token can't call browser routes", (await agent("GET", "/projects")).status === 401);
check("Supabase token can't call agent routes", (await bob("GET", "/agent/projects")).status === 401);
const listed = (await bob("GET", "/agent-tokens")).body.tokens;
check("token list never includes the secret", listed.length >= 1 && !JSON.stringify(listed).includes(tok.body.token));
// ---- taking a feature away applies to the browser and the agent
await owner("PATCH", `/admin/users/${bobMe.id}`, { features: ["planner", "projects"] });
check("Money removed: overview 403", (await bob("GET", "/money/overview")).status === 403);
check("Money removed: agent money 403", (await agent("GET", "/agent/money/left")).status === 403);
check("Projects still allowed for agent", (await agent("GET", "/agent/projects")).status === 200);
await owner("PATCH", `/admin/users/${bobMe.id}`, { features: ["money", "projects"] });
check("Planner removed: browser 403", (await bob("GET", "/planner/day")).status === 403);
check("Planner removed: agent 403", (await agent("GET", "/agent/planner/today")).status === 403);
await owner("PATCH", `/admin/users/${bobMe.id}`, { features: ["money", "planner", "projects"] });

// ---- agent expense logging (give Food a limit so the "left this month" sentence shows)
const bobFood = (await bob("GET", "/money/categories")).body.categories.find((c) => c.name === "Food");
await bob("PATCH", `/money/categories/${bobFood.id}`, { monthlyLimitCents: 1_000_000 });
const logged = await agent("POST", "/agent/money/expenses", { category: " FOOD ", amount: 12.4, note: "McDonald's \"big\" one" });
check("agent logs by category name, euros to cents", logged.status === 201 && logged.body.expense.amountCents === 1240 && logged.body.expense.category === "Food" && logged.body.expense.note === "McDonald's \"big\" one", JSON.stringify(logged.body));
check("agent speech shows amount and what's left, no date for today", logged.body?.speech?.startsWith("Logged €12.40 in Food. ") && logged.body.speech.includes("left in Food this month"), logged.body?.speech);
const lastMonth = await agent("POST", "/agent/money/expenses", { category: "Food", amount: 3, spentOn: "2026-09-15" });
check("agent can backdate; speech names the date, no 'this month' line", lastMonth.status === 201 && lastMonth.body.expense.spentOn === "2026-09-15" && lastMonth.body.speech === "Logged €3.00 in Food on 2026-09-15.", JSON.stringify(lastMonth.body));
check("sub-cent amount rejected (400)", (await agent("POST", "/agent/money/expenses", { category: "Food", amount: 1.234 })).status === 400);
check("euros over 100000 rejected (400)", (await agent("POST", "/agent/money/expenses", { category: "Food", amount: 100000.01 })).status === 400);
const unknown = await agent("POST", "/agent/money/expenses", { category: `OwnerOnly ${run}`, amount: 5 });
check("owner's category name is unknown to Bob (404)", unknown.status === 404 && unknown.body.error.code === "unknown_category", JSON.stringify(unknown.body));
check("unknown_category lists only Bob's categories", Array.isArray(unknown.body.error.details?.categories) && unknown.body.error.details.categories.includes("Food") && !unknown.body.error.details.categories.includes(`OwnerOnly ${run}`), JSON.stringify(unknown.body.error.details));
// Other: archived Other comes back instead of clashing on name
const bobOther = (await bob("GET", "/money/categories")).body.categories.find((c) => c.name === "Other");
await bob("PATCH", `/money/categories/${bobOther.id}`, { archived: true });
const toOther = await agent("POST", "/agent/money/expenses", { category: "other", amount: 30, note: "gifts" });
check("archived Other is un-archived and used", toOther.status === 201 && toOther.body.expense.category === "Other", JSON.stringify(toOther.body));
const others = (await bob("GET", "/money/categories")).body.categories.filter((c) => c.name === "Other");
check("still exactly one Other, active", others.length === 1 && others[0].archived === false && others[0].id === bobOther.id);
check("Bob's agent can't undo owner's expense (404)", (await agent("DELETE", `/agent/money/expenses/${ownerExpense.body.expense.id}`)).status === 404);
const undo = await agent("DELETE", `/agent/money/expenses/${logged.body.expense.id}`);
check("agent undo removes the expense", undo.status === 200 && undo.body.speech === "Removed €12.40 from Food.", JSON.stringify(undo.body));
check("undo twice -> 404", (await agent("DELETE", `/agent/money/expenses/${logged.body.expense.id}`)).status === 404);
const ownerStillHas = (await owner("GET", "/money/expenses?month=2026-10")).body.expenses.some((e) => e.id === ownerExpense.body.expense.id);
check("owner's expense untouched", ownerStillHas);
// ---- planner (agent)
const gymTick = await agent("POST", "/agent/planner/habits/check", { habit: "gym" });
check("agent ticks weekly habit for this week", gymTick.status === 200 && gymTick.body.frequency === "weekly" && gymTick.body.period === periodMonday(today) && gymTick.body.speech.startsWith("Ticked Gym for this week."), JSON.stringify(gymTick.body));
const readTick = await agent("POST", "/agent/planner/habits/check", { habit: ` read ${run} ` });
check("agent ticks daily habit for today", readTick.status === 200 && readTick.body.period === today && /🔥 1 day\b/.test(readTick.body.speech), JSON.stringify(readTick.body));
const unknownHabit = await agent("POST", "/agent/planner/habits/check", { habit: "meditate" });
check("unknown habit -> 404 with Bob's list only", unknownHabit.status === 404 && unknownHabit.body.error.code === "unknown_habit" && unknownHabit.body.error.details.habits.some((h) => h.name === "Gym") && !JSON.stringify(unknownHabit.body).includes("Owner"), JSON.stringify(unknownHabit.body));
const top = await agent("PUT", "/agent/planner/tasks", { tasks: ["Call the bank", "Finish report"] });
check("agent sets top 3", top.status === 200 && top.body.tasks.length === 2 && top.body.speech === "Top 3 for today: Call the bank, Finish report.", JSON.stringify(top.body));
check("agent top 3 over 3 rejected (400)", (await agent("PUT", "/agent/planner/tasks", { tasks: ["a", "b", "c", "d"] })).status === 400);
const done = await agent("POST", "/agent/planner/tasks/done", { task: "call the BANK" });
check("agent marks a task done by text", done.status === 200 && done.body.task.done === true && done.body.speech === "Done: Call the bank. 1 of 2 done.", JSON.stringify(done.body));
check("agent marks a task done by position", (await agent("POST", "/agent/planner/tasks/done", { task: "2" })).body?.task?.text === "Finish report");
check("unknown task -> 404", (await agent("POST", "/agent/planner/tasks/done", { task: "nope" })).status === 404);
const plan = await agent("GET", "/agent/planner/today");
check("agent reads the plan", plan.status === 200 && plan.body.speech.startsWith("Top 3: Call the bank (done), Finish report (done).") && plan.body.speech.includes("All daily habits done."), plan.body?.speech);
const untick = await agent("DELETE", "/agent/planner/habits/check", { habit: "Gym" });
check("agent unticks", untick.status === 200 && untick.body.checked === false && untick.body.speech === "Unticked Gym for this week.", JSON.stringify(untick.body));
check("Bob's agent can't see owner's habits", !JSON.stringify(plan.body).includes(`${oh}`));
const bobExport3 = (await bob("GET", "/export")).body;
check("export is version 3 with Bob's planner only", bobExport3.version === 3 && bobExport3.planner.habits.length === 2 && !JSON.stringify(bobExport3.planner).includes(`${oh}`), JSON.stringify(bobExport3.planner?.habits?.map((h) => h.name)));

await bob("DELETE", `/agent-tokens/${tok.body.id}`);
check("revoked token stops working", (await agent("GET", "/agent/projects")).status === 401);
check("owner can't revoke Bob's token id", (await owner("DELETE", `/agent-tokens/${tok.body.id}`)).status === 404);

// ---- import replaces only the importer's data and re-ids rows
const before = (await owner("GET", "/projects")).body.projects.length;
const imp = await bob("POST", "/import", bobExport);
check("Bob can import his export", imp.status === 200, JSON.stringify(imp.body));
check("Bob's import left owner's projects alone", (await owner("GET", "/projects")).body.projects.length === before);
const reimported = (await bob("GET", "/projects")).body.projects;
check("import gave rows new ids", reimported.length === 1 && reimported[0].id !== bobProj.body.project.id);
const imp3 = await bob("POST", "/import", bobExport3);
check("version 3 import restores planner", imp3.status === 200 && imp3.body.imported.habits === 2, JSON.stringify(imp3.body));
const bobHabitsAfter = (await bob("GET", "/planner/habits")).body.habits;
check("imported habits got new ids", bobHabitsAfter.length === 2 && bobHabitsAfter.every((h) => h.id !== bobGym.body.habit.id && h.id !== bobRead.body.habit.id));
check("owner's habits untouched by Bob's import", (await owner("GET", "/planner/habits")).body.habits.some((h) => h.id === oh));

console.log(failures === 0 ? "\nAll isolation checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

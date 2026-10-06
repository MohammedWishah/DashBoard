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
check("admin can toggle their own extras", (await owner("PATCH", `/admin/users/${ownerMe.id}`, { extras: ["home_today", "kind_streaks", "wins", "wants", "nudges"] })).status === 200);
check("admin /me shows extras", JSON.stringify((await owner("GET", "/me")).body.extras) === JSON.stringify(["home_today", "kind_streaks", "wins", "wants", "nudges"]));
check("new person has no extras", JSON.stringify(bobMe.extras) === "[]", JSON.stringify(bobMe));
check("non-admin can't toggle extras (403)", (await bob("PATCH", `/admin/users/${bobMe.id}`, { extras: ["wants"] })).status === 403);
check("unknown extra rejected (400)", (await owner("PATCH", `/admin/users/${bobMe.id}`, { extras: ["root"] })).status === 400);
check("empty PATCH body rejected (400)", (await owner("PATCH", `/admin/users/${bobMe.id}`, {})).status === 400);
check("unknown feature rejected (400)", (await owner("PATCH", `/admin/users/${bobMe.id}`, { features: ["root"] })).status === 400);
const grant = await owner("PATCH", `/admin/users/${bobMe.id}`, { features: ["money", "planner", "projects"] });
check("admin grants Bob Projects", grant.status === 200 && grant.body.user.features.includes("projects"));
check("grant applies immediately", (await bob("GET", "/projects")).status === 200);
await owner("PATCH", `/admin/users/${bobMe.id}`, { extras: ["wants", "wins", "kind_streaks", "nudges", "home_today"] });
const regrant = await owner("PATCH", `/admin/users/${bobMe.id}`, { features: ["money", "planner", "projects"] });
check("changing sections keeps extras", regrant.body.user.extras.length === 5, JSON.stringify(regrant.body));
check("Bob's /me has his extras", (await bob("GET", "/me")).body.extras.includes("wants"));

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
await owner("PATCH", `/planner/habits/${oh}`, { archived: true });
check("ticking an archived habit (409)", (await owner("PUT", `/planner/habits/${oh}/checks/${today}`)).status === 409);
await owner("PATCH", `/planner/habits/${oh}`, { archived: false });

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
check("Money off hides the Want list extra", !(await bob("GET", "/me")).body.extras.includes("wants"));
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
const commaAmount = await agent("POST", "/agent/money/expenses", { category: "Food", amount: "12,40" });
check("agent amount '12,40' -> 1240 cents", commaAmount.status === 201 && commaAmount.body.expense.amountCents === 1240, JSON.stringify(commaAmount.body));
await agent("DELETE", `/agent/money/expenses/${commaAmount.body.expense.id}`);
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
// forgiving streaks: Read ticked 3 and 2 days ago, yesterday missed, today open
const rid = bobRead.body.habit.id;
await bob("DELETE", `/planner/habits/${rid}/checks/${today}`);
const back = (n) => new Date(Date.parse(`${today}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
await bob("PUT", `/planner/habits/${rid}/checks/${back(3)}`);
await bob("PUT", `/planner/habits/${rid}/checks/${back(2)}`);
const kindRead = (await bob("GET", `/planner/day?date=${today}`)).body.habits.daily.find((h) => h.id === rid);
check("forgiving streak survives one miss and is at risk", kindRead.streak === 2 && kindRead.atRisk === true && kindRead.total >= 2, JSON.stringify(kindRead));
await owner("PATCH", `/admin/users/${bobMe.id}`, { extras: ["wants", "wins", "nudges", "home_today"] });
const classicRead = (await bob("GET", `/planner/day?date=${today}`)).body.habits.daily.find((h) => h.id === rid);
check("classic streak without the extra", classicRead.streak === 0 && classicRead.atRisk === false && classicRead.total === null, JSON.stringify(classicRead));
await owner("PATCH", `/admin/users/${bobMe.id}`, { extras: ["wants", "wins", "kind_streaks", "nudges", "home_today"] });
await bob("PUT", `/planner/habits/${rid}/checks/${today}`);
// ---- habit extras + energy
const tinyHabit = await bob("POST", "/planner/habits", { name: `Stretch ${run}`, frequency: "daily", tiny: "One stretch", timeOfDay: "morning" });
check("habit keeps tiny and time of day", tinyHabit.status === 201 && tinyHabit.body?.habit?.tiny === "One stretch" && tinyHabit.body?.habit?.timeOfDay === "morning", JSON.stringify(tinyHabit.body));
const cleared = await bob("PATCH", `/planner/habits/${tinyHabit.body?.habit?.id}`, { tiny: "" });
check("empty tiny clears it", cleared.body?.habit?.tiny === null, JSON.stringify(cleared.body));
const bobHabitIds = ((await bob("GET", "/planner/habits")).body?.habits ?? []).map((h) => h.id);
check("reorder own habits", (await bob("PUT", "/planner/habits/order", { ids: [...bobHabitIds].reverse() })).status === 200);
check("reorder with someone else's id (404)", (await bob("PUT", "/planner/habits/order", { ids: [oh] })).status === 404);
check("energy off: 403", (await bob("PUT", `/planner/energy/${today}`, { level: "high" })).status === 403);
await owner("PATCH", `/admin/users/${bobMe.id}`, { extras: ["wants", "wins", "kind_streaks", "nudges", "home_today", "tiny_habits", "time_of_day", "energy"] });
check("energy for today", (await bob("PUT", `/planner/energy/${today}`, { level: "low" })).status === 200);
check("energy overwrite is an upsert", (await bob("PUT", `/planner/energy/${today}`, { level: "high" })).status === 200 && (await bob("GET", `/planner/day?date=${today}`)).body?.energy === "high");
check("energy for tomorrow (400)", (await bob("PUT", `/planner/energy/${tomorrow}`, { level: "ok" })).status === 400);
const agentEnergy = await agent("POST", "/agent/planner/energy", { level: "ok" });
check("agent logs energy", agentEnergy.status === 200 && agentEnergy.body?.speech === "Logged energy: ok for today.", JSON.stringify(agentEnergy.body));
await owner("PUT", `/planner/energy/${today}`, { level: "low" });
check("energy is per person", (await owner("GET", `/planner/day?date=${today}`)).body?.energy === "low" && (await bob("GET", `/planner/day?date=${today}`)).body?.energy === "ok");
await owner("PATCH", `/planner/habits/${oh}`, { archived: true });
const archivedRow = ((await owner("GET", "/planner/habits")).body?.habits ?? []).find((h) => h.id === oh);
check("archiving stamps archivedAt", typeof archivedRow?.archivedAt === "string", JSON.stringify(archivedRow));
await owner("PATCH", `/planner/habits/${oh}`, { archived: false });
check("restoring clears archivedAt", ((await owner("GET", "/planner/habits")).body?.habits ?? []).find((h) => h.id === oh)?.archivedAt === null);
// ---- want list
const want = await bob("POST", "/money/wants", { name: "AirPods", priceCents: 20000 });
check("Bob adds a want (3-day wait at €200)", want.status === 201 && Date.parse(want.body.want.readyAt) - Date.parse(want.body.want.createdAt) === 72 * 3600000, JSON.stringify(want.body));
const ownerWant = await owner("POST", "/money/wants", { name: "Owner lamp", priceCents: 3000 });
check("owner adds a want (1-day wait)", ownerWant.status === 201);
const wl = (await bob("GET", "/money/wants")).body;
check("Bob sees only his wants", wl.waiting.length === 1 && wl.waiting[0].name === "AirPods" && wl.savedCents === 0, JSON.stringify(wl));
for (const [name, fn] of [
  ["buy owner's want", () => bob("POST", `/money/wants/${ownerWant.body.want.id}/buy`, { categoryId: bobCat.body.category.id })],
  ["skip owner's want", () => bob("POST", `/money/wants/${ownerWant.body.want.id}/skip`)],
  ["delete owner's want", () => bob("DELETE", `/money/wants/${ownerWant.body.want.id}`)],
]) {
  const r = await fn();
  check(`Bob can't ${name} (404)`, r.status === 404, `got ${r.status}`);
}
const bought = await bob("POST", `/money/wants/${want.body.want.id}/buy`, { categoryId: bobCat.body.category.id });
check("buying logs one expense", bought.status === 200 && typeof bought.body.expenseId === "string", JSON.stringify(bought.body));
check("buying twice (409)", (await bob("POST", `/money/wants/${want.body.want.id}/buy`, { categoryId: bobCat.body.category.id })).status === 409);
const agentWant = await agent("POST", "/agent/money/wants", { name: "Lamp", amount: "39,90" });
check("agent adds a want with speech", agentWant.status === 201 && agentWant.body.speech === "Added Lamp (€39.90) to your want list. Ask me again in 1 day.", JSON.stringify(agentWant.body));
check("agent unknown want (404, Bob's list only)", (await agent("POST", "/agent/money/wants/skip", { name: "Owner lamp" })).status === 404);
const agentSkip = await agent("POST", "/agent/money/wants/skip", { name: "lamp" });
check("agent skips a want", agentSkip.status === 200 && agentSkip.body.speech === "Skipped Lamp. Saved €39.90 by waiting.", JSON.stringify(agentSkip.body));
check("saved by waiting adds up", (await bob("GET", "/money/wants")).body.savedCents === 3990);
await owner("PATCH", `/admin/users/${bobMe.id}`, { extras: ["wins", "kind_streaks", "nudges", "home_today"] });
check("Want list off: browser 403", (await bob("GET", "/money/wants")).status === 403);
check("Want list off: agent 403", (await agent("POST", "/agent/money/wants", { name: "x", amount: 1 })).status === 403);
await owner("PATCH", `/admin/users/${bobMe.id}`, { extras: ["wants", "wins", "kind_streaks", "nudges", "home_today"] });
// ---- Other created on demand; archived categories aren't matched
const bobCats2 = (await bob("GET", "/money/categories")).body.categories;
const bobOther2 = bobCats2.find((c) => c.name === "Other");
await bob("PATCH", `/money/categories/${bobOther2.id}`, { name: `Misc ${run}` });
const newOther = await agent("POST", "/agent/money/expenses", { category: "Other", amount: 1 });
check("Other is created when none exists", newOther.status === 201 && newOther.body?.expense?.category === "Other", JSON.stringify(newOther.body));
await agent("DELETE", `/agent/money/expenses/${newOther.body?.expense?.id}`);
const funCat = bobCats2.find((c) => c.name === "Fun");
await bob("PATCH", `/money/categories/${funCat.id}`, { archived: true });
check("archived non-Other category isn't matched (404)", (await agent("POST", "/agent/money/expenses", { category: "fun", amount: 1 })).status === 404);
await bob("PATCH", `/money/categories/${funCat.id}`, { archived: false });
check("duplicate category name in other case (409)", (await bob("POST", "/money/categories", { name: "FUN" })).status === 409);
// ---- wins
const wins = await bob("GET", "/planner/wins");
check("Bob's wins count his own things", wins.status === 200 && wins.body.total >= 1 && wins.body.skipped.some((s) => s.name === "Lamp"), JSON.stringify(wins.body));
check("Bob's wins never include the owner's", !JSON.stringify(wins.body).includes("Owner"));
check("wins with a non-Monday week (400)", (await bob("GET", "/planner/wins?week=2026-10-06")).status === 400);
await owner("PATCH", `/admin/users/${bobMe.id}`, { extras: ["wants", "kind_streaks", "nudges", "home_today"] });
check("Wins off: 403", (await bob("GET", "/planner/wins")).status === 403);
await owner("PATCH", `/admin/users/${bobMe.id}`, { extras: ["wants", "wins", "kind_streaks", "nudges", "home_today"] });
// ---- briefings
const morning = await agent("GET", "/agent/briefing/morning");
check("morning brief speaks", morning.status === 200 && morning.body.message.startsWith("Good morning."), JSON.stringify(morning.body));
check("morning brief never mentions the owner", !morning.body.message.includes("Owner"));
const weekly = await agent("GET", "/agent/briefing/weekly");
check("weekly brief speaks", weekly.status === 200 && weekly.body.message.startsWith("Week in review"), JSON.stringify(weekly.body));
check("unknown brief kind (400)", (await agent("GET", "/agent/briefing/noon")).status === 400);
await owner("PATCH", `/admin/users/${bobMe.id}`, { extras: ["wants", "wins", "kind_streaks", "home_today"] });
const silent = await agent("GET", "/agent/briefing/morning");
check("nudges off: silent, not 403", silent.status === 200 && silent.body.message === "", JSON.stringify(silent.body));
await owner("PATCH", `/admin/users/${bobMe.id}`, { extras: ["wants", "wins", "kind_streaks", "nudges", "home_today"] });
check("Bob's agent can't see owner's habits", !JSON.stringify(plan.body).includes(`${oh}`));
const bobExport3 = (await bob("GET", "/export")).body;
check("export is version 3 with Bob's planner only", bobExport3.version === 3 && bobExport3.planner.habits.length === 3 && !JSON.stringify(bobExport3.planner).includes(`${oh}`), JSON.stringify(bobExport3.planner?.habits?.map((h) => h.name)));

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
check("version 3 import restores planner", imp3.status === 200 && imp3.body?.imported?.habits === 3, JSON.stringify(imp3.body));
const bobHabitsAfter = (await bob("GET", "/planner/habits")).body.habits;
check("imported habits got new ids", bobHabitsAfter.length === 3 && bobHabitsAfter.every((h) => h.id !== bobGym.body.habit.id && h.id !== bobRead.body.habit.id));
check("export v3 carries wants and energy", Array.isArray(bobExport3.money?.wants) && Array.isArray(bobExport3.planner?.energy), JSON.stringify(Object.keys(bobExport3.money ?? {})));
check("owner's habits untouched by Bob's import", (await owner("GET", "/planner/habits")).body.habits.some((h) => h.id === oh));

console.log(failures === 0 ? "\nAll isolation checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

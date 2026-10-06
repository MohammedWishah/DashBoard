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
check("owner is admin with every feature", ownerMe.isAdmin === true && ownerMe.features.length === 4, JSON.stringify(ownerMe));
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
await owner("PATCH", `/admin/users/${bobMe.id}`, { features: ["money", "planner", "projects"] });

// ---- agent expense logging (give Food a limit so the "left this month" sentence shows)
const bobFood = (await bob("GET", "/money/categories")).body.categories.find((c) => c.name === "Food");
await bob("PATCH", `/money/categories/${bobFood.id}`, { monthlyLimitCents: 1_000_000 });
const logged = await agent("POST", "/agent/money/expenses", { category: " FOOD ", amount: 12.4, note: "McDonald's \"big\" one" });
check("agent logs by category name, euros to cents", logged.status === 201 && logged.body.expense.amountCents === 1240 && logged.body.expense.category === "Food" && logged.body.expense.note === "McDonald's \"big\" one", JSON.stringify(logged.body));
check("agent speech shows amount and what's left", logged.body?.speech?.startsWith("Logged €12.40 in Food.") && logged.body.speech.includes("left in Food this month"), logged.body?.speech);
const lastMonth = await agent("POST", "/agent/money/expenses", { category: "Food", amount: 3, spentOn: "2026-09-15" });
check("agent can backdate; no 'this month' line for last month", lastMonth.status === 201 && lastMonth.body.expense.spentOn === "2026-09-15" && !lastMonth.body.speech.includes("this month"), JSON.stringify(lastMonth.body));
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

console.log(failures === 0 ? "\nAll isolation checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

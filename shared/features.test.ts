import { describe, expect, it } from "vitest";
import { effectiveExtras, effectiveFeatures } from "./features";

describe("effectiveExtras", () => {
  it("keeps stored extras whose section is on", () => {
    expect(effectiveExtras(["money", "wants", "wins"], ["money"])).toEqual(["wants"]);
  });
  it("drops extras whose section is off", () => {
    expect(effectiveExtras(["wants", "home_today"], ["planner"])).toEqual(["home_today"]);
  });
  it("keeps extras that need no section", () => {
    expect(effectiveExtras(["nudges"], [])).toEqual(["nudges"]);
  });
  it("ignores unknown strings and sections", () => {
    expect(effectiveExtras(["money", "root", "habits"], ["money", "planner", "projects"])).toEqual([]);
  });
  it("gives the admin no extras unless stored", () => {
    expect(effectiveExtras([], effectiveFeatures(true, []))).toEqual([]);
  });
});

describe("effectiveFeatures ignores extras", () => {
  it("returns sections only", () => {
    expect(effectiveFeatures(false, ["money", "wants", "nudges"])).toEqual(["money"]);
  });
});

describe("habit extras", () => {
  it("need Planner", () => {
    expect(effectiveExtras(["tiny_habits", "time_of_day", "energy"], ["planner"])).toEqual(["tiny_habits", "time_of_day", "energy"]);
    expect(effectiveExtras(["tiny_habits", "time_of_day", "energy"], ["money"])).toEqual([]);
  });
});

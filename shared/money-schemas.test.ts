import { describe, expect, it } from "vitest";
import { agentAmountSchema, agentExpenseCreateSchema } from "./money-schemas";

describe("agentAmountSchema", () => {
  it("accepts numbers and decimal strings with . or ,", () => {
    expect(agentAmountSchema.parse(12.4)).toBe(12.4);
    expect(agentAmountSchema.parse("12,40")).toBe(12.4);
    expect(agentAmountSchema.parse("12.4")).toBe(12.4);
    expect(agentAmountSchema.parse(" 50 ")).toBe(50);
  });
  it("rejects sub-cent, thousands-style and junk strings", () => {
    expect(agentAmountSchema.safeParse("12,345").success).toBe(false);
    expect(agentAmountSchema.safeParse("1.234,50").success).toBe(false);
    expect(agentAmountSchema.safeParse("abc").success).toBe(false);
    expect(agentAmountSchema.safeParse("0").success).toBe(false);
    expect(agentAmountSchema.safeParse(1.234).success).toBe(false);
  });
  it("is used by the agent expense schema", () => {
    expect(agentExpenseCreateSchema.parse({ category: "Food", amount: "12,40" }).amount).toBe(12.4);
  });
});

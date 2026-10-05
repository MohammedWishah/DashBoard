import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { ApiError } from "./errors";

/** zValidator that reports failures in the API's standard error shape. */
export function validate<T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      const summary = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ");
      throw new ApiError(400, "validation_error", summary || "Invalid request", issues);
    }
  });
}

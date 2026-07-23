export function reportLovableError(error: unknown, context?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.error("[Lovable Error Report]", error, context);
  }
}

/**
 * What the device said, in the words meant for a person. A Play the
 * repository refuses carries its reasons as a list of issues, each written
 * for the Coach; the JSON the error prints them in, paths and all, is
 * bookkeeping he should never have to read.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    const { issues } = error as { readonly issues?: unknown };
    if (Array.isArray(issues)) {
      const said = issues.flatMap((issue: unknown) => {
        const message = (issue as { readonly message?: unknown } | null)
          ?.message;
        return typeof message === "string" && message.trim() ? [message] : [];
      });
      if (said.length > 0) return said.join(" ");
    }
    if (error.message.trim()) return error.message;
  }
  return String(error);
}

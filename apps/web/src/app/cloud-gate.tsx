import type { ReactNode } from "react";

import { ClerkWiredSession } from "./clerk-session";
import { clerkIsConfigured } from "./cloud-env";
import { CloudSessionHost, type CloudSession } from "./cloud-session";
import type { ChalkRuntime } from "./editor-runtime";

export function CloudGate({
  runtime,
  children,
}: {
  readonly runtime: ChalkRuntime;
  readonly children: (session: CloudSession) => ReactNode;
}) {
  if (clerkIsConfigured()) {
    return <ClerkWiredSession runtime={runtime}>{children}</ClerkWiredSession>;
  }
  return <CloudSessionHost runtime={runtime}>{children}</CloudSessionHost>;
}

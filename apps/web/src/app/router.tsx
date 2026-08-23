import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { ChalkApp } from "../components/chalk-app";
import { createBrowserLifecycle } from "./browser-lifecycle";
import { CloudGate } from "./cloud-gate";
import { createBrowserRuntime } from "./editor-runtime";

// Registered before the data opens so a stale cached shell is caught first.
const lifecycle = createBrowserLifecycle();
const runtime = await createBrowserRuntime();

const rootRoute = createRootRoute();
const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <CloudGate runtime={runtime}>
      {(session) => (
        <ChalkApp
          identity={session.identity}
          lifecycle={lifecycle}
          runtime={runtime}
          sync={session.sync}
        />
      )}
    </CloudGate>
  ),
});

const routeTree = rootRoute.addChildren([editorRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

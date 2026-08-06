import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { ChalkApp } from "../components/chalk-app";
import { createBrowserRuntime } from "./editor-runtime";

const runtime = await createBrowserRuntime();

const rootRoute = createRootRoute();
const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <ChalkApp runtime={runtime} />,
});

const routeTree = rootRoute.addChildren([editorRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

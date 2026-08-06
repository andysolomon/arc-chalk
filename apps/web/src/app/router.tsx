import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { ChalkApp } from "../components/chalk-app";
import { createBrowserEditorStore } from "./editor-runtime";

const editorStore = await createBrowserEditorStore();

const rootRoute = createRootRoute();
const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <ChalkApp editorStore={editorStore} />,
});

const routeTree = rootRoute.addChildren([editorRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

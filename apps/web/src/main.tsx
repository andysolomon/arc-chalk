import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { CloudProviders } from "./app/cloud-providers";
import { router } from "./app/router";
import "./styles/app.css";

const queryClient = new QueryClient();
const root = document.getElementById("root");

if (!root) throw new Error("Chalk could not find its application root.");

createRoot(root).render(
  <StrictMode>
    <CloudProviders>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </CloudProviders>
  </StrictMode>,
);

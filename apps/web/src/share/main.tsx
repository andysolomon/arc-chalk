import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createShareCloud } from "./convex-share";
import { ShareApp } from "./share-app";
import "../styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("Chalk could not find its Share Link root.");

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const cloud = convexUrl ? createShareCloud(convexUrl) : undefined;

createRoot(root).render(
  <StrictMode>
    <ShareApp
      loadAttachment={
        cloud ? (input) => cloud.loadAttachment(input) : undefined
      }
      openShare={
        cloud
          ? (input) => cloud.openShare(input)
          : () => Promise.resolve({ outcome: "not-found" as const })
      }
    />
  </StrictMode>,
);

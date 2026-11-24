import { createHash } from "node:crypto";
import { resolve } from "node:path";

const checkoutSlot =
  createHash("sha256")
    .update(resolve(import.meta.dirname, ".."))
    .digest()
    .readUInt16BE(0) % 1000;

export const checkoutPort = (ciPort: number, firstLocalPort: number): number =>
  process.env.CI ? ciPort : firstLocalPort + checkoutSlot;

import type { SyncSnapshot } from "@chalk/sync";

export function syncStatusLabel(snapshot: SyncSnapshot): string {
  switch (snapshot.status) {
    case "syncing":
      return "syncing";
    case "synced":
      return "synced";
    case "offline":
      return "offline";
    case "conflict":
      return "conflict";
    case "revoked":
      return "sign in";
    case "signed-out":
      return "local";
    case "local":
      return "local";
  }
}

---
status: accepted
---

# Isolate environments and promote production explicitly

Chalk separates local development, pull-request previews, permanent staging, and production. Backend changes remain compatible across the deployment window, and production release is an explicit promotion after automated and physical-device gates rather than an automatic consequence of merging code.

## Consequences

- Local development uses a local or personal Convex development deployment and synthetic fixture data.
- Each pull request receives an isolated Convex preview deployment and Cloudflare preview URL.
- Preview environments use Clerk development identity and never receive copied production Coach data.
- A permanent staging environment has separate Convex resources, Clerk configuration, R2 bucket, custom domain, secrets, and deploy keys.
- Production uses separate resources and least-privilege production deploy keys.
- Convex functions and additive schema changes deploy before the compatible PWA bundle.
- Persistent schema evolution follows expand, backfill, verify, and contract across releases.
- A release does not remove an old data shape in the same deployment that stops producing it.
- Service-worker updates activate only after the required backend is live and the app is outside an active interaction or export.
- Staging must pass the release gates in ADR 0021 before production promotion.
- Production deployment requires explicit approval; a merged branch does not deploy automatically.
- The previous compatible PWA and Convex function bundle remain identifiable and redeployable for rollback.


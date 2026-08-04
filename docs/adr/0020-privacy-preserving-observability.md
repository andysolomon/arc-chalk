---
status: accepted
---

# Observe performance and failures without observing Play content

Chalk uses Sentry for browser error reporting and performance traces, including Convex exception reporting, while relying on Convex and Cloudflare native service health metrics. Telemetry follows an explicit allowlist and never captures confidential coaching content or interaction recordings.

## Consequences

- Sentry captures browser exceptions, unhandled rejections, release health, and sampled performance spans.
- Convex exception reporting forwards backend failures to the same operational workflow; Convex health metrics cover function execution, concurrency, scheduling, and usage.
- Cloudflare native metrics cover PWA delivery, request status, cache behavior, and edge performance.
- Chalk does not enable session replay, DOM recording, screenshots, keystroke capture, or console capture containing arbitrary application values.
- Beta does not add PostHog, Axiom, or generalized product analytics.
- Allowed performance measurements include launch, locally available Play opening, input-to-paint, local save acknowledgement, synchronization, animation frame health, and export duration.
- Telemetry may tag release, domain-schema version, browser class, device class, connectivity state, and a random installation identifier.
- Telemetry scrubbing removes Play and Playbook names, Coach identity, entity IDs, geometry, Assignments, notes, Share tokens, URL secrets, email addresses, IP addresses, and binary content.
- Public Share Link routes are normalized before error or trace transmission so bearer material cannot enter observability systems.
- External Convex log streaming is deferred unless native operational retention proves insufficient.
- The observability adapter sits behind a Chalk-owned port and must fail silently without affecting editing, saving, synchronization, or export.


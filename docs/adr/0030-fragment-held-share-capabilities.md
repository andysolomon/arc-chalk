---
status: accepted
---

# Keep Share Link bearer secrets in URL fragments

Each Share Link separates a non-secret public identifier in the route from a cryptographically random bearer secret in the URL fragment. The static Share shell reads the fragment and presents the secret directly to Convex, preventing ordinary HTTP infrastructure from observing the capability.

## Consequences

- Share URLs use the shape `https://<host>/s/<publicId>#<secret>`.
- `publicId` locates the Share Link record but grants no access.
- The fragment secret contains at least 256 bits of cryptographic randomness and is base64url encoded.
- Browsers do not send the fragment in HTTP requests or referrer headers, so Cloudflare request logs and static hosting never receive it.
- The Share application reads the fragment and sends the secret directly to a narrowly scoped Convex validation function over TLS.
- Convex stores only a keyed cryptographic hash of the secret and uses constant-time comparison.
- The secret is excluded from route parameters, server-rendered HTML, Sentry, analytics, console output, and application logs.
- The public Share shell loads no third-party scripts and sends `Referrer-Policy: no-referrer` with a restrictive Content Security Policy.
- Revocation and expiration invalidate validation immediately.
- Rotating a compromised Share Link generates a new secret while preserving the underlying Share Publication.
- The complete URL remains copyable and reloadable; recipients are warned that anyone holding it has access.


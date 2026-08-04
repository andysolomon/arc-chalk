---
status: accepted
---

# Normalize and address private image attachments on the device

Chalk processes image attachments locally before persistence or upload. Normalized images and thumbnails are immediately available offline, stripped of camera metadata, verified by content hash, and synchronized to private R2 independently of Play revisions.

## Consequences

- Chalk accepts JPEG, PNG, WebP, and browser-decodable HEIC input.
- Inputs over 20 MiB or 40 megapixels are rejected before full processing with a clear explanation.
- Local processing applies orientation, removes EXIF and GPS metadata, normalizes color orientation, and limits the longest edge to 2,560 pixels.
- Transparency is preserved when needed; opaque images use a high-quality JPEG representation.
- Each image receives a 512-pixel thumbnail for lists and previews.
- Decoding, resizing, and encoding run in a Worker where the platform supports the required image APIs.
- Normalized image and thumbnail blobs commit to IndexedDB immediately and remain usable offline.
- SHA-256 content hashes identify blobs for deduplication, integrity checks, and immutable R2 object keys.
- Upload to private R2 is asynchronous and never blocks attaching the local image to a Play.
- Original filenames and Coach captions are sanitized metadata and never become object keys.
- Play revisions reference asset IDs and hashes; binary bytes never enter revision documents.
- Unreferenced assets become eligible for garbage collection only after the 30-day recovery period and applicable bucket lock expire.
- Editor and export rendering use the normalized local blob when available, preserving offline output.


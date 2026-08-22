import {
  AssetValidationError,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_PIXELS,
  assertDecodedImageLimits,
  assertImageTransferLimits,
  constantTimeEqual,
  contentAddressedObjectKey,
  createSharePublication,
  decideShareAccess,
  generateShareSecret,
  hashShareSecret,
  imageContainsExif,
  normalizeImage,
  publicIdFromSharePath,
  redactShareUrl,
  scaleToLongestEdge,
  secretFromLocationHash,
  shareLinkUrl,
  playDocumentFromPublished,
  publicationContainsAsset,
  sharePublicationSchema,
  shareSecretMatches,
  sniffImageMime,
  storedMimeForImage,
  validateFilmReferenceUrl,
  applyPlayCommand,
  applyPlayCommandWithInverse,
  canonicalStringify,
  diffPlayDocuments,
  playDocumentSchema,
} from "@chalk/domain";
import { offensiveStickThunderPlay } from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

function jpegBytes(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}

function pngBytes(): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
  ]);
}

function webpBytes(): Uint8Array {
  const bytes = new Uint8Array(12);
  new TextEncoder().encodeInto("RIFF", bytes.subarray(0, 4));
  new TextEncoder().encodeInto("WEBP", bytes.subarray(8, 12));
  return bytes;
}

function heicBytes(): Uint8Array {
  const bytes = new Uint8Array(12);
  bytes.set([0x00, 0x00, 0x00, 0x18]);
  new TextEncoder().encodeInto("ftyp", bytes.subarray(4, 8));
  new TextEncoder().encodeInto("heic", bytes.subarray(8, 12));
  return bytes;
}

describe("private image intake", () => {
  it("sniffs JPEG, PNG, WebP, and HEIC from magic bytes", () => {
    expect(sniffImageMime(jpegBytes())).toBe("image/jpeg");
    expect(sniffImageMime(pngBytes())).toBe("image/png");
    expect(sniffImageMime(webpBytes())).toBe("image/webp");
    expect(sniffImageMime(heicBytes())).toBe("image/heic");
    expect(sniffImageMime(Uint8Array.from([0x00, 0x01, 0x02]))).toBeUndefined();
  });

  it("rejects empty, oversized, and over-pixel images before processing", () => {
    expect(() => assertImageTransferLimits(0)).toThrow(AssetValidationError);
    expect(() => assertImageTransferLimits(IMAGE_MAX_BYTES + 1)).toThrow(
      /20 MB/,
    );
    expect(() => assertDecodedImageLimits(1, IMAGE_MAX_PIXELS + 1)).toThrow(
      /40 megapixels/,
    );
    expect(() => assertDecodedImageLimits(0, 10)).toThrow(/could not read/);
  });

  it("scales the longest edge and keeps transparency as PNG", () => {
    expect(scaleToLongestEdge(5120, 2560, 2560)).toEqual({
      width: 2560,
      height: 1280,
    });
    expect(scaleToLongestEdge(800, 600, 2560)).toEqual({
      width: 800,
      height: 600,
    });
    expect(storedMimeForImage(true, "image/jpeg")).toBe("image/png");
    expect(storedMimeForImage(false, "image/jpeg")).toBe("image/jpeg");
    expect(storedMimeForImage(false, "image/webp")).toBe("image/webp");
    expect(storedMimeForImage(false, "image/heic")).toBe("image/jpeg");
  });

  it("re-encodes so original EXIF never becomes the stored object", async () => {
    const original = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0xff, 0xd9,
    ]);
    expect(imageContainsExif(original)).toBe(true);
    const encoded = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const normalized = await normalizeImage(original, {
      decode: () =>
        Promise.resolve({ width: 3200, height: 1600, hasAlpha: false }),
      resize: (_source, width, height) =>
        Promise.resolve({
          width,
          height,
          hasAlpha: false,
        }),
      encode: () => Promise.resolve(encoded),
    });
    expect(normalized.width).toBe(2560);
    expect(normalized.height).toBe(1280);
    expect(normalized.thumbnailWidth).toBe(512);
    expect(imageContainsExif(normalized.bytes)).toBe(false);
    expect(normalized.bytes).toBe(encoded);
    expect(normalized.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses an encoded image that still carries Exif", async () => {
    const withExif = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    ]);
    expect(imageContainsExif(withExif)).toBe(true);
    await expect(
      normalizeImage(jpegBytes(), {
        decode: () =>
          Promise.resolve({ width: 10, height: 10, hasAlpha: false }),
        resize: () =>
          Promise.resolve({ width: 10, height: 10, hasAlpha: false }),
        encode: () => Promise.resolve(withExif),
      }),
    ).rejects.toThrow(/camera metadata/);
  });

  it("addresses R2 objects by content hash rather than a Coach filename", () => {
    const hash = "a".repeat(64);
    expect(contentAddressedObjectKey(hash)).toBe(`images/${hash}`);
    expect(() => contentAddressedObjectKey("not-a-hash")).toThrow();
  });
});

describe("Film References", () => {
  it("accepts public https addresses and rejects everything else", () => {
    expect(validateFilmReferenceUrl("https://www.hudl.com/video/3/clip")).toBe(
      "https://www.hudl.com/video/3/clip",
    );
    expect(() => validateFilmReferenceUrl("http://hudl.com/clip")).toThrow(
      /https/,
    );
    expect(() => validateFilmReferenceUrl("javascript:alert(1)")).toThrow(
      /https/,
    );
    expect(() =>
      validateFilmReferenceUrl("https://user:pass@hudl.com/clip"),
    ).toThrow(/username or password/);
    expect(() => validateFilmReferenceUrl("https://localhost/clip")).toThrow(
      /public https host/,
    );
    expect(() => validateFilmReferenceUrl("https://192.168.1.4/clip")).toThrow(
      /public https host/,
    );
    expect(() => validateFilmReferenceUrl("https://10.0.0.8/film")).toThrow(
      /public https host/,
    );
  });

  it("stores a Film Reference on a Play and strips it from nowhere except publication", () => {
    const play = playDocumentSchema.parse({
      ...structuredClone(offensiveStickThunderPlay),
      filmReferences: [
        {
          id: "film_hudl",
          url: "https://www.hudl.com/video/3/clip",
          label: "Install cut-up",
        },
      ],
    });
    expect(play.filmReferences?.[0]?.url).toContain("hudl.com");
    expect(
      playDocumentSchema.safeParse({
        ...play,
        filmReferences: [{ id: "film_bad", url: "http://example.com" }],
      }).success,
    ).toBe(false);
  });
});

describe("Share Link capabilities", () => {
  const pepper = "share-token-pepper-for-tests-32ch";

  it("puts 256 bits of randomness in the fragment, never the route", () => {
    const secret = generateShareSecret(() => new Uint8Array(32).fill(7));
    const url = shareLinkUrl("https://chalk.example", "share_public", secret);
    expect(url).toBe(`https://chalk.example/s/share_public#${secret}`);
    expect(publicIdFromSharePath("/s/share_public")).toBe("share_public");
    expect(publicIdFromSharePath("/editor")).toBeUndefined();
    expect(secretFromLocationHash(`#${secret}`)).toBe(secret);
    expect(secretFromLocationHash("#short")).toBeUndefined();
    expect(secret.length).toBeGreaterThanOrEqual(43);
  });

  it("stores a keyed hash and compares it in constant time", async () => {
    const secret = generateShareSecret(() => new Uint8Array(32).fill(9));
    const hash = await hashShareSecret(secret, pepper);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await shareSecretMatches(secret, hash, pepper)).toBe(true);
    expect(await shareSecretMatches(generateShareSecret(), hash, pepper)).toBe(
      false,
    );
    expect(
      constantTimeEqual(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 3])),
    ).toBe(true);
    expect(
      constantTimeEqual(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 4])),
    ).toBe(false);
  });

  it("redacts the fragment so logs cannot keep the bearer secret", () => {
    const secret = generateShareSecret(() => new Uint8Array(32).fill(3));
    const url = shareLinkUrl("https://chalk.example", "share_public", secret);
    expect(redactShareUrl(url)).toBe(
      "https://chalk.example/s/share_public#redacted",
    );
    expect(redactShareUrl(url)).not.toContain(secret);
  });

  it("revokes and expires before a matching secret can open the publication", () => {
    const record = {
      publicId: "share_public",
      coachId: "coach_1",
      publicationId: "publication_1",
      secretHash: "ab".repeat(32),
      createdAtMs: 1,
    };
    expect(decideShareAccess(undefined, true, 10)).toBe("not-found");
    expect(decideShareAccess(record, false, 10)).toBe("invalid-secret");
    expect(decideShareAccess({ ...record, revokedAtMs: 2 }, true, 10)).toBe(
      "revoked",
    );
    expect(decideShareAccess({ ...record, expiresAtMs: 5 }, true, 10)).toBe(
      "expired",
    );
    expect(decideShareAccess(record, true, 10)).toBe("granted");
  });
});

describe("Share Publications with attachments and Film References", () => {
  const hash = "b".repeat(64);

  it("projects attachments and film without notes, assignments, or ownership", () => {
    const privatePlay = playDocumentSchema.parse({
      ...structuredClone(offensiveStickThunderPlay),
      notes: "Do not publish this coaching note.",
      attachments: [
        {
          id: "attachment_install",
          hash,
          mimeType: "image/jpeg",
          width: 800,
          height: 600,
          byteLength: 12_000,
          caption: "Wristband photo",
        },
      ],
      filmReferences: [
        {
          id: "film_hudl",
          url: "https://www.hudl.com/video/3/clip",
          label: "Install cut-up",
        },
      ],
    });
    const publication = createSharePublication({
      id: "publication_install_two",
      title: "Install Two",
      publishedAtMs: 1_786_000_000_000,
      entries: [
        {
          id: "publication_entry_stick",
          playRevisionId: "revision_stick_12",
          play: privatePlay,
        },
      ],
      presentation: {
        fieldStyle: "lines",
        playback: true,
        downloads: ["svg"],
      },
    });

    expect(sharePublicationSchema.parse(publication)).toEqual(publication);
    const published = publication.entries[0]!.play;
    expect(published.attachments?.[0]?.hash).toBe(hash);
    expect(published.filmReferences?.[0]?.url).toContain("hudl.com");
    expect(published).not.toHaveProperty("notes");
    expect(published).not.toHaveProperty("assignments");
    expect(published).not.toHaveProperty("playbookId");
    expect(publicationContainsAsset(publication, hash)).toBe(true);
    expect(publicationContainsAsset(publication, "a".repeat(64))).toBe(false);
    const rehydrated = playDocumentFromPublished(published);
    expect(rehydrated.notes).toBe("");
    expect(rehydrated.assignments).toEqual([]);
    expect(rehydrated.playbookId).toBe("playbook_shared");
    expect(rehydrated.attachments?.[0]?.hash).toBe(hash);
    expect(rehydrated.paths).toEqual(privatePlay.paths);
  });

  it("attaches and removes an image as one invertible command", () => {
    const play = offensiveStickThunderPlay;
    const attachment = {
      id: "attachment_one",
      hash: "c".repeat(64),
      mimeType: "image/png" as const,
      width: 64,
      height: 64,
      byteLength: 80,
    };
    const { document, inverse } = applyPlayCommandWithInverse(play, {
      kind: "insert-attachments",
      attachments: [{ index: 0, item: attachment }],
    });
    expect(document.attachments).toEqual([attachment]);
    expect(canonicalStringify(applyPlayCommand(document, inverse))).toBe(
      canonicalStringify(play),
    );
    expect(
      canonicalStringify(
        applyPlayCommand(
          play,
          diffPlayDocuments(play, document, "Attach image"),
        ),
      ),
    ).toBe(canonicalStringify(document));
  });

  it("adds and removes a Film Reference as one invertible command", () => {
    const play = offensiveStickThunderPlay;
    const film = {
      id: "film_one",
      url: "https://www.hudl.com/video/3/clip",
      label: "Install cut-up",
    };
    const { document, inverse } = applyPlayCommandWithInverse(play, {
      kind: "insert-film-references",
      filmReferences: [{ index: 0, item: film }],
    });
    expect(document.filmReferences).toEqual([film]);
    expect(canonicalStringify(applyPlayCommand(document, inverse))).toBe(
      canonicalStringify(play),
    );
  });
});

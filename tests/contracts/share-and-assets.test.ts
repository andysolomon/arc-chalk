import {
  confirmAssetUpload,
  createShareLink,
  openShareLink,
  republishShareLink,
  requestAssetDownload,
  requestAssetUpload,
  revokeShareLink,
  setShareExpiry,
  type AssetMetadataStore,
  type AssetRecord,
  type ObjectStorePort,
  type ShareStore,
  type SignedObjectAccess,
} from "@chalk/contracts";
import {
  createSharePublication,
  generateShareSecret,
  type ShareAccessEvent,
  type ShareLinkState,
  type SharePublication,
} from "@chalk/domain";
import { offensiveStickThunderPlay } from "@chalk/test-fixtures";
import { describe, expect, it } from "vitest";

const PEPPER = "share-token-pepper-for-tests-32ch!!";

function publication(name = "Stick — Thunder"): SharePublication {
  return createSharePublication({
    id: "publication_one",
    title: name,
    publishedAtMs: 100,
    entries: [
      {
        id: "entry_one",
        playRevisionId: "revision_one",
        play: { ...offensiveStickThunderPlay, name },
      },
    ],
    presentation: { fieldStyle: "lines", playback: true, downloads: [] },
  });
}

function memoryShare(): ShareStore & { events: ShareAccessEvent[] } {
  const links = new Map<string, ShareLinkState>();
  const publications = new Map<string, SharePublication>();
  const events: ShareAccessEvent[] = [];
  return {
    events,
    getLink: (publicId) => Promise.resolve(links.get(publicId)),
    listLinks: (coachId) =>
      Promise.resolve(
        [...links.values()].filter((link) => link.coachId === coachId),
      ),
    putLink: (link) => {
      links.set(link.publicId, link);
      return Promise.resolve();
    },
    getPublication: (id) => Promise.resolve(publications.get(id)),
    putPublication: (doc) => {
      publications.set(doc.id, doc);
      return Promise.resolve();
    },
    recordAccess: (event) => {
      events.push(event);
      return Promise.resolve();
    },
  };
}

function memoryAssets(): {
  store: AssetMetadataStore;
  objects: ObjectStorePort & { puts: string[]; gets: string[] };
} {
  const records = new Map<string, AssetRecord>();
  const puts: string[] = [];
  const gets: string[] = [];
  return {
    store: {
      getByHash: (hash) => Promise.resolve(records.get(hash)),
      put: (record) => {
        records.set(record.hash, record);
        return Promise.resolve();
      },
    },
    objects: {
      puts,
      gets,
      signPut: (key) => {
        puts.push(key);
        return Promise.resolve({
          url: `https://r2.test/${key}?sig=put`,
          headers: { "content-type": "image/jpeg" },
          expiresAtMs: 1_000,
        } satisfies SignedObjectAccess);
      },
      signGet: (key) => {
        gets.push(key);
        return Promise.resolve({
          url: `https://r2.test/${key}?sig=get`,
          expiresAtMs: 1_000,
        });
      },
    },
  };
}

describe("immutable Share Links", () => {
  it("opens with the fragment secret and refuses after revoke", async () => {
    const store = memoryShare();
    const secret = generateShareSecret(() => new Uint8Array(32).fill(1));
    await createShareLink(store, {
      coachId: "coach_1",
      publicId: "share_public",
      publication: publication(),
      secret,
      pepper: PEPPER,
      nowMs: 10,
    });

    const opened = await openShareLink(store, {
      publicId: "share_public",
      secret,
      pepper: PEPPER,
      nowMs: 20,
    });
    expect(opened.outcome).toBe("granted");
    if (opened.outcome === "granted") {
      expect(opened.publication.title).toBe("Stick — Thunder");
      expect(opened.publication.entries[0]?.play).not.toHaveProperty("notes");
    }

    const denied = await openShareLink(store, {
      publicId: "share_public",
      secret: generateShareSecret(() => new Uint8Array(32).fill(2)),
      pepper: PEPPER,
      nowMs: 21,
    });
    expect(denied.outcome).toBe("invalid-secret");

    await revokeShareLink(store, {
      coachId: "coach_1",
      publicId: "share_public",
      nowMs: 30,
    });
    const revoked = await openShareLink(store, {
      publicId: "share_public",
      secret,
      pepper: PEPPER,
      nowMs: 31,
    });
    expect(revoked.outcome).toBe("revoked");
    expect(store.events.map(({ outcome }) => outcome)).toEqual([
      "granted",
      "invalid-secret",
      "revoked",
    ]);
    expect(JSON.stringify(store.events)).not.toContain(secret);
  });

  it("republishes new content behind the same public identifier", async () => {
    const store = memoryShare();
    const secret = generateShareSecret(() => new Uint8Array(32).fill(4));
    await createShareLink(store, {
      coachId: "coach_1",
      publicId: "share_public",
      publication: publication("First cut"),
      secret,
      pepper: PEPPER,
      nowMs: 10,
    });
    await republishShareLink(store, {
      coachId: "coach_1",
      publicId: "share_public",
      publication: {
        ...publication("Updated cut"),
        id: "publication_two",
        publishedAtMs: 50,
      },
      nowMs: 50,
    });
    const opened = await openShareLink(store, {
      publicId: "share_public",
      secret,
      pepper: PEPPER,
      nowMs: 60,
    });
    expect(opened.outcome).toBe("granted");
    if (opened.outcome === "granted") {
      expect(opened.publication.title).toBe("Updated cut");
      expect(opened.publication.id).toBe("publication_two");
    }
  });

  it("expires a Share Link without changing its public identifier", async () => {
    const store = memoryShare();
    const secret = generateShareSecret(() => new Uint8Array(32).fill(5));
    await createShareLink(store, {
      coachId: "coach_1",
      publicId: "share_public",
      publication: publication(),
      secret,
      pepper: PEPPER,
      nowMs: 10,
    });
    await setShareExpiry(store, {
      coachId: "coach_1",
      publicId: "share_public",
      expiresAtMs: 50,
    });
    const expired = await openShareLink(store, {
      publicId: "share_public",
      secret,
      pepper: PEPPER,
      nowMs: 50,
    });
    expect(expired.outcome).toBe("expired");
  });
});

describe("private content-addressed assets", () => {
  const hash = "d".repeat(64);

  it("returns a short-lived put URL once, then treats the hash as uploaded", async () => {
    const { store, objects } = memoryAssets();
    const first = await requestAssetUpload(store, objects, {
      coachId: "coach_1",
      hash,
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
      byteLength: 1200,
      nowMs: 1,
      objectKey: `images/${hash}`,
    });
    expect(first.status).toBe("upload");
    await confirmAssetUpload(store, {
      coachId: "coach_1",
      hash,
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
      byteLength: 1200,
      nowMs: 2,
    });
    const second = await requestAssetUpload(store, objects, {
      coachId: "coach_1",
      hash,
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
      byteLength: 1200,
      nowMs: 3,
      objectKey: `images/${hash}`,
    });
    expect(second.status).toBe("exists");
    expect(objects.puts).toHaveLength(1);
  });

  it("refuses downloads unless the caller is allowed", async () => {
    const { store, objects } = memoryAssets();
    await confirmAssetUpload(store, {
      coachId: "coach_1",
      hash,
      mimeType: "image/png",
      width: 10,
      height: 10,
      byteLength: 40,
      nowMs: 1,
    });
    await expect(
      requestAssetDownload(store, objects, {
        hash,
        objectKey: `images/${hash}`,
        nowMs: 2,
        allowed: false,
      }),
    ).rejects.toThrow(/Unauthorized/);
    const access = await requestAssetDownload(store, objects, {
      hash,
      objectKey: `images/${hash}`,
      nowMs: 2,
      allowed: true,
    });
    expect(access.url).toContain(hash);
    expect(objects.gets).toEqual([`images/${hash}`]);
  });
});

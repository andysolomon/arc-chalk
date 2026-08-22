import {
  AssetValidationError,
  canonicalStringify,
  createSharePublication,
  createStableId,
  generateShareSecret,
  sanitizeFilmLabel,
  sanitizeImageCaption,
  shareLinkUrl,
  validateFilmReferenceUrl,
} from "@chalk/domain";
import { useState, useSyncExternalStore } from "react";

import type { ChalkRuntime } from "../app/editor-runtime";
import { blobsFromNormalized, processImageFile } from "../assets/process-image";

type PanelState =
  | { readonly phase: "idle" }
  | { readonly phase: "working" }
  | { readonly phase: "done"; readonly message: string }
  | { readonly phase: "error"; readonly message: string };

export function PlaySharePanel({ runtime }: { runtime: ChalkRuntime }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="backup-section">
      <button
        aria-expanded={open}
        className="menu-entry"
        onClick={() => setOpen((shown) => !shown)}
        type="button"
      >
        Share & assets
      </button>
      <div className="backup-panel share-assets-panel" hidden={!open}>
        <AttachImageForm runtime={runtime} />
        <FilmReferenceForm runtime={runtime} />
        <ShareLinkForm runtime={runtime} />
      </div>
    </div>
  );
}

function AttachImageForm({ runtime }: { runtime: ChalkRuntime }) {
  const document = useSyncExternalStore(
    runtime.editorStore.subscribe,
    runtime.editorStore.getSnapshot,
  ).document;
  const [caption, setCaption] = useState("");
  const [state, setState] = useState<PanelState>({ phase: "idle" });

  const attach = (file: File) => {
    setState({ phase: "working" });
    void processImageFile(file)
      .then(async (image) => {
        const blobs = blobsFromNormalized(image);
        await runtime.putImage({
          hash: image.hash,
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          byteLength: image.byteLength,
          blob: blobs.blob,
          thumbnail: blobs.thumbnail,
          createdAtMs: Date.now(),
        });
        const cleaned = sanitizeImageCaption(caption || undefined);
        await runtime.editorStore.applyCommand({
          kind: "insert-attachments",
          attachments: [
            {
              index: document.attachments?.length ?? 0,
              item: {
                id: createStableId("attachment"),
                hash: image.hash,
                mimeType: image.mimeType,
                width: image.width,
                height: image.height,
                byteLength: image.byteLength,
                ...(cleaned === undefined ? {} : { caption: cleaned }),
              },
            },
          ],
        });
        setCaption("");
        setState({ phase: "done", message: "Image attached on this device." });
        void uploadInBackground(runtime, image, blobs.blob);
      })
      .catch((error: unknown) => {
        setState({
          phase: "error",
          message:
            error instanceof AssetValidationError
              ? error.message
              : "Chalk could not attach that image.",
        });
      });
  };

  return (
    <section className="share-assets-block">
      <h3>Attach image</h3>
      <p className="version-empty">
        JPEG, PNG, WebP, or HEIC. Camera metadata is stripped on this device
        before anything is stored.
      </p>
      <label className="backup-field">
        <span>Caption</span>
        <input
          aria-label="Image caption"
          maxLength={120}
          onChange={(event) => setCaption(event.target.value)}
          value={caption}
        />
      </label>
      <label className="backup-field">
        <span>Image file</span>
        <input
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          aria-label="Attach image"
          disabled={state.phase === "working"}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) attach(file);
            event.target.value = "";
          }}
          type="file"
        />
      </label>
      <ul className="share-asset-list">
        {(document.attachments ?? []).map((attachment) => (
          <li key={attachment.id}>
            <span>{attachment.caption ?? "Attached image"}</span>
            <button
              onClick={() =>
                void runtime.editorStore.applyCommand({
                  kind: "remove-attachments",
                  attachmentIds: [attachment.id],
                })
              }
              type="button"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <StatusLine state={state} />
    </section>
  );
}

function FilmReferenceForm({ runtime }: { runtime: ChalkRuntime }) {
  const document = useSyncExternalStore(
    runtime.editorStore.subscribe,
    runtime.editorStore.getSnapshot,
  ).document;
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [state, setState] = useState<PanelState>({ phase: "idle" });

  const add = () => {
    try {
      const href = validateFilmReferenceUrl(url);
      const cleaned = sanitizeFilmLabel(label || undefined);
      setState({ phase: "working" });
      void runtime.editorStore
        .applyCommand({
          kind: "insert-film-references",
          filmReferences: [
            {
              index: document.filmReferences?.length ?? 0,
              item: {
                id: createStableId("film"),
                url: href,
                ...(cleaned === undefined ? {} : { label: cleaned }),
              },
            },
          ],
        })
        .then(() => {
          setUrl("");
          setLabel("");
          setState({ phase: "done", message: "Film Reference added." });
        })
        .catch(() =>
          setState({
            phase: "error",
            message: "Chalk could not add that Film Reference.",
          }),
        );
    } catch (error) {
      setState({
        phase: "error",
        message:
          error instanceof AssetValidationError
            ? error.message
            : "That Film Reference is not a public https address.",
      });
    }
  };

  return (
    <section className="share-assets-block">
      <h3>Film Reference</h3>
      <p className="version-empty">
        An https link to film Chalk does not host, proxy, or cache.
      </p>
      <label className="backup-field">
        <span>Address</span>
        <input
          aria-label="Film Reference address"
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://"
          type="url"
          value={url}
        />
      </label>
      <label className="backup-field">
        <span>Label</span>
        <input
          aria-label="Film Reference label"
          maxLength={80}
          onChange={(event) => setLabel(event.target.value)}
          value={label}
        />
      </label>
      <button disabled={url.length === 0} onClick={add} type="button">
        Add Film Reference
      </button>
      <ul className="share-asset-list">
        {(document.filmReferences ?? []).map((film) => (
          <li key={film.id}>
            <a
              href={film.url}
              rel="noopener noreferrer nofollow"
              referrerPolicy="no-referrer"
              target="_blank"
            >
              {film.label ?? film.url}
            </a>
            <button
              onClick={() =>
                void runtime.editorStore.applyCommand({
                  kind: "remove-film-references",
                  filmReferenceIds: [film.id],
                })
              }
              type="button"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <StatusLine state={state} />
    </section>
  );
}

function ShareLinkForm({ runtime }: { runtime: ChalkRuntime }) {
  const snapshot = useSyncExternalStore(
    runtime.editorStore.subscribe,
    runtime.editorStore.getSnapshot,
  );
  const [copiedUrl, setCopiedUrl] = useState<string>();
  const [publicId, setPublicId] = useState<string>();
  const [state, setState] = useState<PanelState>({ phase: "idle" });

  const publicationJson = () => {
    const revisionId = snapshot.versions[0]?.id ?? createStableId("revision");
    return canonicalStringify(
      createSharePublication({
        id: createStableId("publication"),
        title: snapshot.document.name,
        publishedAtMs: Date.now(),
        entries: [
          {
            id: createStableId("publication_entry"),
            playRevisionId: revisionId,
            play: snapshot.document,
          },
        ],
        presentation: {
          fieldStyle: "lines",
          playback: true,
          downloads: [],
        },
      }),
    );
  };

  const publish = () => {
    if (!runtime.shareCloud) {
      setState({
        phase: "error",
        message:
          "Sharing needs an account. Images and Film References still stay on this device.",
      });
      return;
    }
    setState({ phase: "working" });
    const secret = generateShareSecret();
    void runtime.shareCloud
      .createShare({ publicationJson: publicationJson(), secret })
      .then(async (created) => {
        const url = shareLinkUrl(
          window.location.origin,
          created.publicId,
          secret,
        );
        setPublicId(created.publicId);
        setCopiedUrl(url);
        await navigator.clipboard.writeText(url);
        setState({
          phase: "done",
          message:
            "Share Link copied. Anyone with the complete address can view this publication.",
        });
      })
      .catch(() =>
        setState({
          phase: "error",
          message:
            "Sharing needs an account. Images and Film References still stay on this device.",
        }),
      );
  };

  const republish = () => {
    if (!runtime.shareCloud || !publicId) return;
    setState({ phase: "working" });
    void runtime.shareCloud
      .republishShare({
        publicId,
        publicationJson: publicationJson(),
      })
      .then(() =>
        setState({
          phase: "done",
          message: "Shared version updated. The address did not change.",
        }),
      )
      .catch(() =>
        setState({
          phase: "error",
          message: "Chalk could not update the shared version.",
        }),
      );
  };

  const revoke = () => {
    if (!runtime.shareCloud || !publicId) return;
    setState({ phase: "working" });
    void runtime.shareCloud
      .revokeShare(publicId)
      .then(() => {
        setCopiedUrl(undefined);
        setState({
          phase: "done",
          message: "This Share Link no longer opens the publication.",
        });
      })
      .catch(() =>
        setState({
          phase: "error",
          message: "Chalk could not revoke this Share Link.",
        }),
      );
  };

  return (
    <section className="share-assets-block">
      <h3>Share Link</h3>
      <p className="version-empty">
        Publishes a sanitized snapshot: notes, assignments, and Playbook
        ownership stay private. The secret after # never leaves this browser
        except to Convex over TLS.
      </p>
      <button
        disabled={state.phase === "working"}
        onClick={publish}
        type="button"
      >
        Create Share Link
      </button>
      {copiedUrl ? (
        <label className="backup-field">
          <span>Address</span>
          <input aria-label="Share Link address" readOnly value={copiedUrl} />
        </label>
      ) : null}
      <div className="share-link-actions">
        <button
          disabled={!publicId || state.phase === "working"}
          onClick={republish}
          type="button"
        >
          Update shared version
        </button>
        <button
          disabled={!publicId || state.phase === "working"}
          onClick={revoke}
          type="button"
        >
          Revoke
        </button>
      </div>
      <StatusLine state={state} />
    </section>
  );
}

function StatusLine({ state }: { readonly state: PanelState }) {
  if (state.phase !== "done" && state.phase !== "error") return null;
  return (
    <p className={`backup-status ${state.phase}`} role="status">
      {state.message}
    </p>
  );
}

async function uploadInBackground(
  runtime: ChalkRuntime,
  image: {
    hash: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    width: number;
    height: number;
    byteLength: number;
  },
  blob: Blob,
): Promise<void> {
  if (!runtime.shareCloud) return;
  try {
    const decision = await runtime.shareCloud.requestAssetUpload(image);
    if (decision.status === "upload") {
      const response = await fetch(decision.url, {
        method: "PUT",
        headers: { ...decision.headers },
        body: blob,
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) return;
    }
    await runtime.shareCloud.confirmAssetUpload(image);
    await runtime.markImageUploaded(image.hash, Date.now());
  } catch {
    // Local attach already succeeded; cloud upload retries on a later session.
  }
}

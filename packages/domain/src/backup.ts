import * as z from "zod/mini";

import { migrateStoredPlayDocument } from "./migrations";
import {
  conceptSchema,
  entityIdSchema,
  formationSchema,
  playDocumentSchema,
  playRevisionSchema,
  playbookSchema,
} from "./schema";

/**
 * A Coach's backup is encrypted on the device before it is written anywhere,
 * so a file sitting in cloud storage or an email attachment never exposes a
 * season of football work (ADR 0018).
 */
export const BACKUP_KDF_ITERATIONS = 600_000;
const SALT_BYTES = 32;
const IV_BYTES = 12;
const KEY_BITS = 256;

export class BackupPassphraseError extends Error {
  constructor() {
    super(
      "That passphrase does not open this backup, or the file has been altered.",
    );
    this.name = "BackupPassphraseError";
  }
}

/**
 * Placement is explicit rather than read out of the document, so a backup
 * written before a Play carried its own Playbook still restores where the
 * Coach kept it.
 */
const backupPlaceSchema = {
  playId: entityIdSchema,
  playbookId: entityIdSchema,
  updatedAtMs: z.number().check(z.int(), z.nonnegative()),
  currentRevisionId: z.optional(entityIdSchema),
  deletedAtMs: z.optional(z.number().check(z.int(), z.nonnegative())),
};

const backupPlaySchema = z.object({
  ...backupPlaceSchema,
  document: playDocumentSchema,
});

/** Import tolerates documents an earlier release wrote and migrates them. */
const storedBackupPlaySchema = z.object({
  ...backupPlaceSchema,
  document: z.unknown(),
});

const backupPreferenceSchema = z.object({
  key: z.string().check(z.minLength(1)),
  value: z.unknown(),
  updatedAtMs: z.number().check(z.int(), z.nonnegative()),
});

/**
 * What a backup carries: the Coach's authoritative work and its immutable
 * history. Device-local queues, conflicts, undo history, and derived previews
 * are deliberately absent — they belong to one device, not to the work.
 */
export const backupPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("chalk-backup"),
  createdAtMs: z.number().check(z.int(), z.nonnegative()),
  databaseVersion: z.number().check(z.int(), z.positive()),
  playbooks: z.array(playbookSchema),
  concepts: z.array(conceptSchema),
  formations: z.array(formationSchema),
  plays: z.array(backupPlaySchema),
  revisions: z.array(playRevisionSchema),
  preferences: z.array(backupPreferenceSchema),
});

const base64Schema = z.string().check(z.minLength(1));

/** The header is authenticated but not secret, so a reader can see the KDF. */
export const encryptedBackupHeaderSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("chalk-encrypted-backup"),
  cipher: z.literal("AES-GCM"),
  keyDerivation: z.literal("PBKDF2-SHA-256"),
  iterations: z.number().check(z.int(), z.positive()),
  salt: base64Schema,
  iv: base64Schema,
});

export const encryptedBackupSchema = z.object({
  ...encryptedBackupHeaderSchema.def.shape,
  ciphertext: base64Schema,
});

const readableBackupPayloadSchema = z.object({
  ...backupPayloadSchema.def.shape,
  plays: z.array(storedBackupPlaySchema),
});

/**
 * Reads a backup that may predate the current Play schema, upgrading each Play
 * so a Coach's oldest file still restores.
 */
export function readBackupPayload(input: unknown): BackupPayload {
  const payload = readableBackupPayloadSchema.parse(input);
  return backupPayloadSchema.parse({
    ...payload,
    plays: payload.plays.map((play) => ({
      ...play,
      document: migrateStoredPlayDocument(play.document, play.playbookId),
    })),
  });
}

export type BackupPayload = z.infer<typeof backupPayloadSchema>;
export type BackupPlay = z.infer<typeof backupPlaySchema>;
export type EncryptedBackup = z.infer<typeof encryptedBackupSchema>;
export type EncryptedBackupHeader = z.infer<typeof encryptedBackupHeaderSchema>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

/** The header travels in the clear but is authenticated with the payload. */
function additionalData(header: EncryptedBackupHeader): Uint8Array {
  return encoder.encode(
    JSON.stringify([
      header.schemaVersion,
      header.kind,
      header.cipher,
      header.keyDerivation,
      header.iterations,
      header.salt,
      header.iv,
    ]),
  );
}

export interface EncryptBackupOptions {
  /** Lowering this is for tests only; a Coach's backup uses the default. */
  readonly iterations?: number;
  readonly salt?: Uint8Array;
  readonly iv?: Uint8Array;
}

export async function encryptBackup(
  payload: BackupPayload,
  passphrase: string,
  {
    iterations = BACKUP_KDF_ITERATIONS,
    salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES)),
    iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES)),
  }: EncryptBackupOptions = {},
): Promise<EncryptedBackup> {
  if (!passphrase) {
    throw new RangeError("A backup needs a passphrase the Coach chose.");
  }
  const contents = backupPayloadSchema.parse(payload);
  const header: EncryptedBackupHeader = {
    schemaVersion: 1,
    kind: "chalk-encrypted-backup",
    cipher: "AES-GCM",
    keyDerivation: "PBKDF2-SHA-256",
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
  };
  const key = await deriveKey(passphrase, salt, iterations);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as unknown as BufferSource,
      additionalData: additionalData(header) as unknown as BufferSource,
    },
    key,
    encoder.encode(JSON.stringify(contents)),
  );

  return { ...header, ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptBackup(
  input: unknown,
  passphrase: string,
): Promise<BackupPayload> {
  const backup = encryptedBackupSchema.parse(input);
  const key = await deriveKey(
    passphrase,
    fromBase64(backup.salt),
    backup.iterations,
  );

  let plaintext: ArrayBuffer;
  try {
    plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(backup.iv) as unknown as BufferSource,
        additionalData: additionalData(backup) as unknown as BufferSource,
      },
      key,
      fromBase64(backup.ciphertext) as unknown as BufferSource,
    );
  } catch {
    // A wrong passphrase and a tampered file are indistinguishable, and both
    // mean the same thing to the Coach: this file will not open.
    throw new BackupPassphraseError();
  }

  return readBackupPayload(JSON.parse(decoder.decode(plaintext)));
}

/** Serializes a backup as the portable text file a Coach keeps. */
export function serializeEncryptedBackup(backup: EncryptedBackup): string {
  return JSON.stringify(encryptedBackupSchema.parse(backup), undefined, 2);
}

export function parseEncryptedBackup(contents: string): EncryptedBackup {
  return encryptedBackupSchema.parse(JSON.parse(contents));
}

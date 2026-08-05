import { migrateLegacyFieldProfile } from "./field-profile";
import {
  playDocumentSchema,
  playDocumentV1Schema,
  type PlayDocument,
} from "./schema";

export function migratePlayDocument(input: unknown): PlayDocument {
  const current = playDocumentSchema.safeParse(input);
  if (current.success) return current.data;

  const legacy = playDocumentV1Schema.parse(input);
  return playDocumentSchema.parse({
    ...legacy,
    schemaVersion: 2,
    fieldProfile: migrateLegacyFieldProfile(legacy.fieldProfile),
  });
}

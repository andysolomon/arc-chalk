/**
 * Chalk's own Coach identifier. Clerk subjects map to this at the API
 * boundary and never leak into domain documents.
 */
export type CoachId = string;

export interface CoachIdentity {
  readonly coachId: CoachId;
  readonly clerkSubject?: string;
  readonly email?: string;
}

export type AuthSession =
  | { readonly status: "loading" }
  | { readonly status: "signed_out" }
  | { readonly status: "signed_in"; readonly identity: CoachIdentity }
  | { readonly status: "unavailable" };

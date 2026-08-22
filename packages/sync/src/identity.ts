/* eslint-disable @typescript-eslint/require-await */
import type { AuthSession, CoachIdentity } from "@chalk/contracts";

import type { IdentityPort } from "./ports";

/**
 * Used when Clerk is not configured. Local editing stays available; cloud
 * operations stay gated.
 */
export class UnavailableIdentity implements IdentityPort {
  readonly configured = false;

  getSession(): AuthSession {
    return { status: "unavailable" };
  }

  subscribe(): () => void {
    return () => undefined;
  }

  async sendEmailCode(): Promise<void> {
    throw new Error("Cloud sign-in is not configured on this device.");
  }

  async verifyEmailCode(): Promise<void> {
    throw new Error("Cloud sign-in is not configured on this device.");
  }

  async signInWithPasskey(): Promise<void> {
    throw new Error("Cloud sign-in is not configured on this device.");
  }

  async enrollPasskey(): Promise<void> {
    throw new Error("Cloud sign-in is not configured on this device.");
  }

  hasPasskey(): boolean {
    return false;
  }

  async signOut(): Promise<void> {
    return;
  }
}

export class MemoryIdentity implements IdentityPort {
  readonly configured = true;
  #session: AuthSession;
  readonly #listeners = new Set<() => void>();

  constructor(session: AuthSession = { status: "signed_out" }) {
    this.#session = session;
  }

  getSession(): AuthSession {
    return this.#session;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  signIn(identity: CoachIdentity): void {
    this.#session = { status: "signed_in", identity };
    this.#emit();
  }

  async sendEmailCode(): Promise<void> {
    return;
  }

  async verifyEmailCode(): Promise<void> {
    return;
  }

  async signInWithPasskey(): Promise<void> {
    return;
  }

  async enrollPasskey(): Promise<void> {
    this.#passkey = true;
    this.#emit();
  }

  hasPasskey(): boolean {
    return this.#passkey;
  }

  async signOut(): Promise<void> {
    this.#session = { status: "signed_out" };
    this.#emit();
  }

  #passkey = false;

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

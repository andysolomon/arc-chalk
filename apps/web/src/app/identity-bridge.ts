import type { AuthSession, CoachIdentity } from "@chalk/contracts";
import type { IdentityPort } from "@chalk/sync";

type SendCode = (email: string) => Promise<void>;
type VerifyCode = (code: string) => Promise<void>;
type VoidAction = () => Promise<void>;

/**
 * Clerk stays behind this port so domain and sync never import the SDK.
 * The React tree pushes session snapshots in; the orchestrator only reads.
 */
export class BridgedIdentity implements IdentityPort {
  readonly configured: boolean;
  #session: AuthSession;
  #hasPasskey = false;
  readonly #listeners = new Set<() => void>();
  sendEmailCodeImpl?: SendCode;
  verifyEmailCodeImpl?: VerifyCode;
  signInWithPasskeyImpl?: VoidAction;
  enrollPasskeyImpl?: VoidAction;
  signOutImpl?: VoidAction;

  constructor(
    configured: boolean,
    session: AuthSession = { status: "loading" },
  ) {
    this.configured = configured;
    this.#session = session;
  }

  getSession(): AuthSession {
    return this.#session;
  }

  setSession(session: AuthSession): void {
    this.#session = session;
    this.#emit();
  }

  setPasskey(enrolled: boolean): void {
    this.#hasPasskey = enrolled;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async sendEmailCode(email: string): Promise<void> {
    if (!this.sendEmailCodeImpl) {
      throw new Error("Cloud sign-in is not configured on this device.");
    }
    await this.sendEmailCodeImpl(email);
  }

  async verifyEmailCode(code: string): Promise<void> {
    if (!this.verifyEmailCodeImpl) {
      throw new Error("Cloud sign-in is not configured on this device.");
    }
    await this.verifyEmailCodeImpl(code);
  }

  async signInWithPasskey(): Promise<void> {
    if (!this.signInWithPasskeyImpl) {
      throw new Error("Passkeys are not available on this device.");
    }
    await this.signInWithPasskeyImpl();
  }

  async enrollPasskey(): Promise<void> {
    if (!this.enrollPasskeyImpl) {
      throw new Error("Passkeys are not available on this device.");
    }
    await this.enrollPasskeyImpl();
    this.#hasPasskey = true;
    this.#emit();
  }

  hasPasskey(): boolean {
    return this.#hasPasskey;
  }

  async signOut(): Promise<void> {
    if (this.signOutImpl) await this.signOutImpl();
    this.#session = { status: "signed_out" };
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

export function signedIn(identity: CoachIdentity): AuthSession {
  return { status: "signed_in", identity };
}

---
status: accepted
---

# Use invitation-only passwordless authentication

The production beta uses Clerk for invitation-only Coach enrollment and passwordless authentication. A six-digit email verification code is the primary sign-in method, with optional passkey enrollment after the Coach has authenticated.

## Consequences

- Coaches do not create or recover passwords.
- Email codes are entered on the device being authenticated, avoiding the cross-device failure mode of opening a magic link on a phone while signing in on a computer.
- Passkeys are optional convenience credentials, not the only route into an account.
- Beta does not support open registration, social login, phone authentication, organizations, or enterprise SSO.
- Chalk stores its own stable Coach identifier and maps Clerk identities to it at the API boundary.
- Authentication remains subject to the offline-access behavior in ADR 0001.


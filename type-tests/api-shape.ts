/**
 * Compile-time tests for the public API surface.
 *
 * No runtime, no Jest — these assertions are checked by `tsc` (via
 * `npm run test:types`). If a future change drops a field, renames a method,
 * or loosens a return type, the build fails before any user sees it.
 */

import { expectTypeOf } from 'expect-type';

import GoogleAuth, {
  AuthorizationResult,
  ConfigureOptions,
  GoogleUser,
  RequestAuthorizationOptions,
  SignInOptions,
  SignInResult,
} from '../src';

// ─── configure ──────────────────────────────────────────────────────────────
expectTypeOf(GoogleAuth.configure).parameters.toEqualTypeOf<
  [ConfigureOptions]
>();
expectTypeOf(GoogleAuth.configure).returns.toBeVoid();
expectTypeOf<ConfigureOptions>().toMatchTypeOf<{ webClientId: string }>();

// ─── signIn ─────────────────────────────────────────────────────────────────
expectTypeOf(GoogleAuth.signIn).returns.resolves.toEqualTypeOf<SignInResult>();
// Optional argument: signIn() and signIn(options) both work
expectTypeOf<Parameters<typeof GoogleAuth.signIn>>().toEqualTypeOf<
  [options?: SignInOptions | undefined]
>();

// SignInResult is a discriminated union with three branches
expectTypeOf<SignInResult['type']>().toEqualTypeOf<
  'success' | 'cancelled' | 'noSavedCredentialFound'
>();

type SuccessBranch = Extract<SignInResult, { type: 'success' }>;
expectTypeOf<SuccessBranch>().toHaveProperty('idToken').toBeString();
expectTypeOf<SuccessBranch>().toHaveProperty('user').toEqualTypeOf<GoogleUser>();

// ─── GoogleUser ─────────────────────────────────────────────────────────────
// Locks down every field. Adding a field is non-breaking; removing or
// renaming one will fail this assertion.
expectTypeOf<GoogleUser>().toEqualTypeOf<{
  email: string;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  phoneNumber: string | null;
  photo: string | null;
}>();

// ─── requestAuthorization ───────────────────────────────────────────────────
expectTypeOf<RequestAuthorizationOptions>()
  .toHaveProperty('scopes')
  .toEqualTypeOf<string[]>();
expectTypeOf<RequestAuthorizationOptions>()
  .toHaveProperty('offlineAccess')
  .toEqualTypeOf<boolean | undefined>();

expectTypeOf(
  GoogleAuth.requestAuthorization,
).returns.resolves.toEqualTypeOf<AuthorizationResult>();

expectTypeOf<AuthorizationResult>().toEqualTypeOf<{
  accessToken: string | null;
  grantedScopes: string[];
  serverAuthCode: string | null;
}>();

// ─── revokeAccess ───────────────────────────────────────────────────────────
expectTypeOf(GoogleAuth.revokeAccess).parameters.toEqualTypeOf<[string]>();
expectTypeOf(GoogleAuth.revokeAccess).returns.resolves.toBeVoid();

// ─── signOut ────────────────────────────────────────────────────────────────
expectTypeOf(GoogleAuth.signOut).parameters.toEqualTypeOf<[]>();
expectTypeOf(GoogleAuth.signOut).returns.resolves.toBeVoid();

# Testing

Three layers, in order of cost and value:

1. **`npm test`** — automated type tests + Kotlin unit tests. Run on every change. ~10 seconds.
2. **Example app smoke test** — run the lifecycle by hand on a real device. ~5 minutes.
3. **Pre-release verification** — full manual checklist below. Run before publishing a new version. ~15 minutes.

## Automated tests

```sh
npm test              # runs both
npm run test:types    # TS type tests only
npm run test:android  # Kotlin unit tests only
```

What's covered:

- **TS type tests** ([type-tests/api-shape.ts](type-tests/api-shape.ts)) — every public method signature, every exported type. Prevents accidental API breaks. Uses [`expect-type`](https://github.com/mmkal/expect-type) compile-time assertions.
- **Kotlin unit tests** ([android/src/test/](android/src/test/kotlin/expo/modules/googlecredentialauth/)) — error contract (exception classes + messages). JVM-only, no emulator. Add more here when you extract pure helpers.

What's *not* covered automatically:

- The native Credential Manager / AuthorizationClient flows — these require a real device, a real Google account, and Google's UI. Verified manually via the example app.
- The activity result bridging in `OnActivityResult` — same reason.
- HTTP behavior of `/revoke` — would need network mocking; not worth it for one endpoint.

## Pre-release manual checklist

Run all of these on a real Android device before publishing a new version. Use **two different Google accounts** so you can spot account-specific cache issues (the kind we hit during initial development).

### Setup

- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] `npm pack --dry-run` shows the right files (no `example/`, no source maps for `node_modules`, etc.)
- [ ] Example app builds: `cd example && npx expo run:android`
- [ ] Real `webClientId` is in `example/App.tsx` (don't commit this)
- [ ] OAuth Consent Screen has at least: `openid`, `userinfo.email`, `userinfo.profile`
- [ ] Test device has the right Google account added in Settings → Accounts

### Sign-in flow

- [ ] First sign-in shows the bottom-sheet picker
- [ ] After signing in and signing out, the next sign-in is one-tap (no picker)
- [ ] After signing in, the stepper shows step 1 complete
- [ ] After signing in, the decoded claims table shows `sub`, `aud`, `email_verified`, `iat`, `exp` and (because the demo passes one) `nonce`
- [ ] `aud` claim matches your `webClientId`
- [ ] If you tap Cancel on the bottom sheet → status shows "User cancelled the sheet", no error thrown

### Authorization flow

- [ ] With only `userinfo.email` / `userinfo.profile` selected and tapping Request Authorization → returns silently (this is the known gotcha — document if it surprises you again)
- [ ] Selecting an API scope (e.g. paste `https://www.googleapis.com/auth/drive.readonly` as custom) → consent screen appears
- [ ] Approving consent → `grantedScopes` includes everything you asked for
- [ ] `accessToken` starts with `ya29.`
- [ ] Fetch /userinfo returns the user's email + name JSON

### Revoke + re-authorize loop

- [ ] After Revoke → next Request Authorization shows the consent screen again (NOT silent)
- [ ] After Revoke → the new access token works for /userinfo
- [ ] Repeat Revoke + Request five times in a row — no degradation, every cycle shows consent

### Sign-out

- [ ] Sign Out → returns to the empty state
- [ ] Next Sign In is one-tap (Credential Manager remembers the account)
- [ ] Sign Out twice in a row doesn't error

### Error paths

- [ ] Sign in on a device with no Google account → returns `{ type: 'noSavedCredentialFound' }`
- [ ] Configure with a wrong/fake `webClientId` → sign-in fails with a clear error
- [ ] Call signIn without calling configure → throws `NotConfiguredException`

### Second account (paranoia)

- [ ] Sign in with a *different* Google account → works first try
- [ ] Switch accounts mid-session works (Sign Out then Sign In with different account)
- [ ] The decoded claims update with the second account's data

If everything passes, you're clear to publish.

## When automated tests fail

- **TS type tests fail** → you changed a public type. Either revert, or accept the change as intentional and update [type-tests/api-shape.ts](type-tests/api-shape.ts). The test failure tells you exactly what shape changed.
- **Kotlin tests fail** → you changed an exception class name or message. Same calculus: revert, or accept and update the test. JS consumers may need to update their error handling.

## Adding new tests

**For a new method on the module:**

1. Update [type-tests/api-shape.ts](type-tests/api-shape.ts) with `expectTypeOf` assertions on the new method's signature.
2. If the method has any pure helper (parsing, transforming), add a Kotlin unit test in [android/src/test/](android/src/test/kotlin/expo/modules/googlecredentialauth/).
3. Add a manual checklist item above for the scenario.

**For a new public type:**

1. Add an `expectTypeOf<NewType>().toEqualTypeOf<{...}>()` assertion in `api-shape.ts`. This locks down every field.

**For a new error path:**

1. Add a new `CodedException` subclass.
2. Add an `ExceptionsTest` case proving the message + class name don't drift.

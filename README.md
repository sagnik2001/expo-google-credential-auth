# expo-google-credential-auth

Modern **Sign in with Google** for Expo / React Native, built on Android's [Credential Manager](https://developer.android.com/identity/sign-in/credential-manager-siwg) API.

Returns a verified Google **ID token** via either a silent one-tap (returning users) or a full account picker (first-time users).

> **Android only.** This package wraps the modern Credential Manager API that Google now recommends for new apps. iOS is not currently supported — open an issue or PR if you need it.

## Why this exists

The popular [`@react-native-google-signin/google-signin`](https://www.npmjs.com/package/@react-native-google-signin/google-signin) free package still wraps the **legacy Google Sign-In SDK** on Android. Google has deprecated that SDK in favor of Credential Manager, which is what this package uses.

The paid Universal Sign-In version uses Credential Manager too — this package gives you the same modern Android flow as a small, focused, open-source alternative.

## Install

```sh
npm install expo-google-credential-auth
# or
yarn add expo-google-credential-auth
```

You'll need a [development build](https://docs.expo.dev/develop/development-builds/introduction/) — Credential Manager requires native code, so it cannot run in Expo Go.

```sh
npx expo prebuild
npx expo run:android
```

## Setup (Google Cloud Console)

You need **two** OAuth client IDs in the same Google Cloud project:

### 1. Android OAuth client

Identifies your app to Google. You don't reference it in code, but it must exist.

- Type: **Android**
- Package name: your app's `android.package` from `app.json`
- SHA-1 fingerprint: see below

Get your debug SHA-1:

```sh
cd android
./gradlew signingReport
```

Look for the `debug` variant's `SHA1` line. For production, you'll also need to add your **release** SHA-1 (and, if using Play App Signing, the Play Signing SHA-1 from Play Console).

### 2. Web OAuth client

This is the one you pass to `configure()` — counterintuitive, but Google uses the Web client as the "audience" of the ID token even on native.

- Type: **Web application**
- No redirect URIs needed

Copy the resulting client ID (ends in `.apps.googleusercontent.com`) — you'll pass it as `webClientId`.

## Usage

```ts
import GoogleAuth from 'expo-google-credential-auth';

// Call once at app startup.
GoogleAuth.configure({
  webClientId: 'XXXX.apps.googleusercontent.com',
});

async function signIn() {
  const result = await GoogleAuth.signIn({
    // Optional: pass a fresh per-attempt nonce. Verify it server-side
    // in the `nonce` claim of the returned ID token to prevent replays.
    nonce: 'a-fresh-random-string',
  });

  switch (result.type) {
    case 'success':
      console.log('Signed in as', result.user.email);
      console.log('ID token:', result.idToken);
      // Send result.idToken to your backend for verification.
      break;
    case 'cancelled':
      // User dismissed the sheet.
      break;
    case 'noSavedCredentialFound':
      // Device has no Google account configured.
      break;
  }
}

async function signOut() {
  await GoogleAuth.signOut();
}
```

### The sign-in flow in detail

`signIn()` runs in two passes for the best UX:

1. **Silent / one-tap** — tries with `filterByAuthorizedAccounts = true`. If exactly one account has previously authorized this app, it signs in silently with a small "Signing you in..." toast. No picker.
2. **Full picker** — if no authorized accounts exist, falls back to showing every Google account on the device.

This means the first sign-in shows the picker; subsequent sign-ins (after `signOut`) are one-tap.

## API

### `configure(options)`

```ts
configure(options: { webClientId: string }): void
```

Stores your Web OAuth client ID. Call once at startup. Throws if `webClientId` is missing.

### `signIn(options?)`

```ts
signIn(options?: { nonce?: string }): Promise<SignInResult>

type SignInResult =
  | { type: 'success'; idToken: string; user: GoogleUser }
  | { type: 'cancelled' }
  | { type: 'noSavedCredentialFound' };

type GoogleUser = {
  id: string;
  email: string;
  name: string | null;
  photo: string | null;
};
```

Returns a typed discriminated union — no exception-as-control-flow for the common "cancelled" / "no account" cases. Real errors (network failure, misconfiguration, etc.) still throw.

### `signOut()`

```ts
signOut(): Promise<void>
```

Clears Credential Manager's auto-select hint for your app. The next `signIn()` will show the picker again. **This does not sign the user out of Google itself** — the Google account remains on the device.

## What this package does *not* do

- **iOS / web / macOS** — Android only.
- **Access tokens for Google APIs** (Drive, Calendar, Gmail, etc.) — Credential Manager only returns ID tokens. Calling Google APIs requires the separate `AuthorizationClient` flow, which isn't included here yet.
- **`revokeAccess`** — Google's revoke endpoint requires an access or refresh token, which Credential Manager doesn't issue. Will be added alongside the authorization flow in a future release.
- **Backend ID token verification** — that's your server's job. Use Google's [`google-auth-library`](https://www.npmjs.com/package/google-auth-library) or any standard JWT library to verify the `aud`, `iss`, signature, and `nonce` claims.

## Troubleshooting

### `noSavedCredentialFound` on emulator

Emulators usually have no Google account. Open device Settings → Accounts → add a Google account, or test on a real device.

### Sign-in fails with a vague error code

Almost always a SHA-1 / package name mismatch. Verify:
- The SHA-1 in your **Android** OAuth client matches the output of `./gradlew signingReport`
- The package name in your **Android** OAuth client matches `android.package` in your app config
- Your **Web** and **Android** OAuth clients are in the **same** Google Cloud project

For production / TestFlight-equivalent builds, you also need to register the release SHA-1 separately.

### `is not a function (it is undefined)` after editing Kotlin

JS hot reloaded but the native module wasn't rebuilt. Run `npx expo run:android` again — native code changes always require a full rebuild.

## License

MIT

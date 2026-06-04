export type GoogleUser = {
  /** Email address. For the stable Google user ID, decode the ID token
   *  (`sub` claim) server-side. */
  email: string;
  /** Full display name, e.g. "Ada Lovelace". May be null. */
  name: string | null;
  /** First name, e.g. "Ada". May be null. */
  givenName: string | null;
  /** Last name, e.g. "Lovelace". May be null. */
  familyName: string | null;
  /** E.164 phone number if the account has one. May be null. */
  phoneNumber: string | null;
  /** URL to the profile picture. May be null. */
  photo: string | null;
};

export type SignInResult =
  | { type: 'success'; idToken: string; user: GoogleUser }
  | { type: 'cancelled' }
  | { type: 'noSavedCredentialFound' };

export type ConfigureOptions = {
  /**
   * The **Web** OAuth client ID from Google Cloud Console. Used on every
   * platform as the ID token's audience, and on iOS as the `serverClientID`
   * so `requestAuthorization({ offlineAccess: true })` can return a server
   * auth code.
   */
  webClientId: string;
  /**
   * The **iOS** OAuth client ID from Google Cloud Console. **Required on iOS**
   * (the GoogleSignIn SDK is driven by it); ignored on Android. May be omitted
   * if you instead set `GIDClientID` in your app's Info.plist.
   */
  iosClientId?: string;
};

export type SignInOptions = {
  /**
   * Optional nonce that will be embedded as the `nonce` claim in the returned
   * ID token. Generate a fresh, unguessable string per sign-in attempt and
   * verify it server-side to prevent replay attacks.
   *
   * **Android only** — the GoogleSignIn iOS SDK does not support embedding a
   * nonce, so this is ignored on iOS.
   */
  nonce?: string;
};

export type RequestAuthorizationOptions = {
  /**
   * OAuth scopes to request, e.g.
   *   ['https://www.googleapis.com/auth/drive.readonly']
   * Standard profile scopes: 'email', 'profile', 'openid'.
   */
  scopes: string[];
  /**
   * If true, also requests a one-time server auth code your backend can
   * exchange for a refresh token. Requires `configure({ webClientId })` to
   * have been called.
   */
  offlineAccess?: boolean;
};

export type AuthorizationResult = {
  /** OAuth 2.0 access token. Use this to call Google APIs and to revoke. */
  accessToken: string | null;
  /** Scopes the user actually granted (may be a subset of what you asked for). */
  grantedScopes: string[];
  /** One-time server auth code, only present when offlineAccess was true. */
  serverAuthCode: string | null;
};

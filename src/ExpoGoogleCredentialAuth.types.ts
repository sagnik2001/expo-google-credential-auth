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
  webClientId: string;
};

export type SignInOptions = {
  /**
   * Optional nonce that will be embedded as the `nonce` claim in the returned
   * ID token. Generate a fresh, unguessable string per sign-in attempt and
   * verify it server-side to prevent replay attacks.
   */
  nonce?: string;
};

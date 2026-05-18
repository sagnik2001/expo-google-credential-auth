/**
 * Example app for expo-google-credential-auth — built as a learning resource.
 *
 * What it demonstrates:
 *   1. configure({ webClientId })       — call once at app startup
 *   2. signIn({ nonce? })               — authentication (get ID token)
 *   3. requestAuthorization({ scopes }) — authorization (get access token)
 *   4. (use the access token to call a real Google API)
 *   5. revokeAccess(accessToken)        — revoke OAuth grant on Google's side
 *   6. signOut()                        — clear local credential state
 *
 * Authentication vs authorization:
 *   signIn()              proves *who* the user is via an ID token (JWT)
 *   requestAuthorization() asks *what* you can do on their behalf (access token)
 *   They're separate flows. Only the access token is revocable.
 */

import GoogleAuth, {
  AuthorizationResult,
  GoogleUser,
  SignInResult,
} from 'expo-google-credential-auth';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// ─── 1. Configure once at module load ───────────────────────────────────────
// `webClientId` is the *Web* OAuth client ID from Google Cloud Console
// (not the Android one). The Android client must also exist with your
// package name + SHA-1, but you don't reference it in code.
//
// Replace the placeholder below with your own. See the project README for
// the full Google Cloud setup walkthrough.
GoogleAuth.configure({
  webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
});

// ─── Available scopes for the interactive picker ────────────────────────────
// AuthorizationClient on Android requires fully-qualified scope URLs.
// The OIDC shortcuts ('email', 'profile') work in some Google libraries but
// not here — use the full forms to get an access token that actually works
// against Google's REST APIs.
const AVAILABLE_SCOPES: { id: string; label: string; description: string }[] = [
  {
    id: 'https://www.googleapis.com/auth/userinfo.email',
    label: 'userinfo.email',
    description: 'See your email address',
  },
  {
    id: 'https://www.googleapis.com/auth/userinfo.profile',
    label: 'userinfo.profile',
    description: 'See basic profile info',
  },
  {
    id: 'openid',
    label: 'openid',
    description: 'OIDC identity (recommended)',
  },
  {
    id: 'https://www.googleapis.com/auth/drive.readonly',
    label: 'drive.readonly',
    description: 'Read files from Google Drive',
  },
  {
    id: 'https://www.googleapis.com/auth/calendar.readonly',
    label: 'calendar.readonly',
    description: 'Read events from Google Calendar',
  },
];

export default function App() {
  // Auth state
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authorization, setAuthorization] = useState<AuthorizationResult | null>(
    null,
  );
  // UI state
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(
    new Set([
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ]),
  );
  const [customScopeInput, setCustomScopeInput] = useState<string>('');
  const [userInfo, setUserInfo] = useState<Record<string, unknown> | null>(null);
  const [userInfoError, setUserInfoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastEvent, setLastEvent] = useState<string>('Ready');

  // Derived: decoded ID token claims (purely informational — never trust
  // client-side decoding for authentication decisions; verify server-side).
  const decodedClaims = useMemo(() => decodeJwtPayload(idToken), [idToken]);

  // Current stage in the lifecycle, drives the stepper at the top.
  const currentStep: Step = !user
    ? 'signIn'
    : !authorization?.accessToken
      ? 'authorize'
      : !userInfo
        ? 'useApi'
        : 'done';

  // ─── Action handlers ──────────────────────────────────────────────────────

  async function handleSignIn() {
    setLoading(true);
    try {
      const nonce = `nonce-${Date.now()}`;
      const result: SignInResult = await GoogleAuth.signIn({ nonce });
      switch (result.type) {
        case 'success':
          setUser(result.user);
          setIdToken(result.idToken);
          setLastEvent('Signed in');
          break;
        case 'cancelled':
          setLastEvent('User cancelled the sheet');
          break;
        case 'noSavedCredentialFound':
          setLastEvent('No Google account on device');
          Alert.alert(
            'No Google account found',
            'Add a Google account in device Settings to sign in.',
          );
          break;
      }
    } catch (e: any) {
      console.log()
      setLastEvent(`Error: ${e.code ?? ''} ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestAuthorization() {
    if (selectedScopes.size === 0) {
      setLastEvent('Select at least one scope');
      return;
    }
    setLoading(true);
    setUserInfo(null);
    setUserInfoError(null);
    try {
      const result = await GoogleAuth.requestAuthorization({
        scopes: Array.from(selectedScopes),
      });
      setAuthorization(result);
      setLastEvent(
        result.accessToken
          ? 'Authorization granted'
          : 'Authorization returned no access token',
      );
    } catch (e: any) {
      setLastEvent(`Authorization error: ${e.code ?? ''} ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleFetchUserInfo() {
    if (!authorization?.accessToken) {
      setUserInfoError('No access token to use — check the Authorization card.');
      return;
    }
    setLoading(true);
    setUserInfoError(null);
    const token = authorization.accessToken;
    console.log('[userinfo] FULL token:', token);
    console.log('[userinfo] length:', token.length);
    console.log('[userinfo] granted scopes:', authorization.grantedScopes);
    try {
      // First introspect the token via tokeninfo — tells us what Google
      // sees this token as (scopes, audience, expiry) without permission checks.
      const introspectRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
      );
      const introspectBody = await introspectRes.text();
      console.log('[tokeninfo] status:', introspectRes.status);
      console.log('[tokeninfo] body:', introspectBody);

      const res = await fetch(
        'https://openidconnect.googleapis.com/v1/userinfo',
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const bodyText = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${bodyText}`);
      }
      const json = JSON.parse(bodyText);
      setUserInfo(json);
      setLastEvent('Fetched /userinfo with access token');
    } catch (e: any) {
      console.log(e)
      setUserInfoError(e.message ?? String(e));
      setLastEvent(`API call failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    if (!authorization?.accessToken) return;
    setLoading(true);
    try {
      await GoogleAuth.revokeAccess(authorization.accessToken);
      setAuthorization(null);
      setUserInfo(null);
      setUserInfoError(null);
      setLastEvent('Access revoked');
    } catch (e: any) {
      setLastEvent(`Revoke error: ${e.code ?? ''} ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    setLoading(true);
    try {
      await GoogleAuth.signOut();
      setUser(null);
      setIdToken(null);
      setAuthorization(null);
      setUserInfo(null);
      setUserInfoError(null);
      setLastEvent('Signed out');
    } finally {
      setLoading(false);
    }
  }

  function toggleScope(id: string) {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function addCustomScope() {
    const value = customScopeInput.trim();
    if (!value) return;
    setSelectedScopes((prev) => new Set(prev).add(value));
    setCustomScopeInput('');
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <View>
          <Text style={styles.title}>Google Credential Auth</Text>
          <Text style={styles.subtitle}>
            A walkthrough of the full sign-in + authorization lifecycle.
          </Text>
        </View>

        <Stepper current={currentStep} />

        {/* Step: Sign in */}
        {!user && (
          <Section
            badge="STEP 1"
            title="Sign in"
            body="Show Google's Credential Manager sheet to authenticate the user. Returns an ID token (JWT) you'd send to your backend for verification."
            code={`const r = await GoogleAuth.signIn({ nonce })`}
          >
            <ActionButton
              label="Sign in with Google"
              variant="primary"
              onPress={handleSignIn}
              disabled={loading}
            />
          </Section>
        )}

        {/* Signed-in user card + decoded claims */}
        {user && idToken && (
          <SignedInCard user={user} idToken={idToken} claims={decodedClaims} />
        )}

        {/* Step: Authorize */}
        {user && (
          <Section
            badge="STEP 2"
            title="Request authorization"
            body="A SEPARATE flow from sign-in. Asks the user to grant OAuth scopes. Returns an access token you can use to call Google APIs (and that you can revoke)."
            code={`await GoogleAuth.requestAuthorization({\n  scopes: [${Array.from(
              selectedScopes,
            )
              .map((s) => `'${s.split('/').pop()}'`)
              .join(', ')}],\n})`}
          >
            <ScopePicker
              selected={selectedScopes}
              onToggle={toggleScope}
              customInput={customScopeInput}
              onCustomInputChange={setCustomScopeInput}
              onAddCustom={addCustomScope}
            />
            <ActionButton
              label={
                authorization?.accessToken
                  ? 'Re-request authorization'
                  : 'Request authorization'
              }
              variant="primary"
              onPress={handleRequestAuthorization}
              disabled={loading || selectedScopes.size === 0}
            />
          </Section>
        )}

        {authorization && <AuthorizationCard result={authorization} />}

        {/* Step: Use API */}
        {authorization?.accessToken && (
          <Section
            badge="STEP 3"
            title="Use the access token"
            body="The access token is what proves you have permission. Use it as a Bearer token to call any Google API the user granted scopes for."
            code={`await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {\n  headers: { Authorization: 'Bearer ' + accessToken }\n})`}
          >
            <ActionButton
              label="Fetch /userinfo"
              variant="primary"
              onPress={handleFetchUserInfo}
              disabled={loading}
            />
            {userInfo && <ApiResultCard data={userInfo} />}
            {userInfoError && (
              <Text style={styles.errorText}>{userInfoError}</Text>
            )}
          </Section>
        )}

        {/* Cleanup */}
        {user && (
          <Section
            badge="CLEANUP"
            title="Revoke or sign out"
            body="revokeAccess() tells Google to forget the OAuth grant — user sees the consent screen again next time. signOut() only clears Credential Manager's auto-select hint."
            code={`await GoogleAuth.revokeAccess(accessToken)\nawait GoogleAuth.signOut()`}
          >
            {authorization?.accessToken && (
              <ActionButton
                label="Revoke access"
                variant="secondary"
                onPress={handleRevoke}
                disabled={loading}
              />
            )}
            <ActionButton
              label="Sign out"
              variant="secondary"
              onPress={handleSignOut}
              disabled={loading}
            />
          </Section>
        )}

        <View style={styles.statusBox}>
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.statusText}>{lastEvent}</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Stepper ────────────────────────────────────────────────────────────────

type Step = 'signIn' | 'authorize' | 'useApi' | 'done';

function Stepper({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'signIn', label: 'Sign in' },
    { id: 'authorize', label: 'Authorize' },
    { id: 'useApi', label: 'Use API' },
    { id: 'done', label: 'Done' },
  ];
  const currentIdx = steps.findIndex((s) => s.id === current);
  return (
    <View style={styles.stepperRow}>
      {steps.map((step, i) => {
        const state =
          i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending';
        return (
          <View key={step.id} style={styles.stepperItem}>
            <View
              style={[
                styles.stepperDot,
                state === 'done' && styles.stepperDotDone,
                state === 'active' && styles.stepperDotActive,
              ]}
            >
              <Text
                style={[
                  styles.stepperDotText,
                  (state === 'done' || state === 'active') &&
                    styles.stepperDotTextActive,
                ]}
              >
                {state === 'done' ? '✓' : String(i + 1)}
              </Text>
            </View>
            <Text
              style={[
                styles.stepperLabel,
                state === 'active' && styles.stepperLabelActive,
              ]}
            >
              {step.label}
            </Text>
            {i < steps.length - 1 && (
              <View
                style={[
                  styles.stepperLine,
                  state === 'done' && styles.stepperLineDone,
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Section wrapper with title, body text, code snippet ────────────────────

function Section({
  badge,
  title,
  body,
  code,
  children,
}: {
  badge: string;
  title: string;
  body: string;
  code?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>{badge}</Text>
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.sectionBody}>{body}</Text>
      {code && (
        <View style={styles.codeBlock}>
          <Text style={styles.codeText}>{code}</Text>
        </View>
      )}
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

// ─── Signed-in user + decoded ID token claims ───────────────────────────────

function SignedInCard({
  user,
  idToken,
  claims,
}: {
  user: GoogleUser;
  idToken: string;
  claims: Record<string, unknown> | null;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.userRow}>
        {user.photo ? (
          <Image source={{ uri: user.photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>
              {(user.name ?? user.email)[0]?.toUpperCase()}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{user.name ?? 'Unnamed'}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
        </View>
      </View>

      <View style={styles.fieldGrid}>
        <Field label="Given name" value={user.givenName} />
        <Field label="Family name" value={user.familyName} />
        <Field label="Phone" value={user.phoneNumber} />
      </View>

      <Text style={styles.label}>ID Token</Text>
      <Text style={styles.tokenText} numberOfLines={2} ellipsizeMode="middle">
        {idToken}
      </Text>

      {claims && <ClaimsTable claims={claims} />}
    </View>
  );
}

const INTERESTING_CLAIMS = [
  'sub',
  'aud',
  'iss',
  'email',
  'email_verified',
  'name',
  'nonce',
  'iat',
  'exp',
];

function ClaimsTable({ claims }: { claims: Record<string, unknown> }) {
  return (
    <View>
      <Text style={styles.label}>Decoded claims (client-side only)</Text>
      <Text style={styles.helpFootnote}>
        ⚠ These values are NOT verified. Always verify the signature, aud, iss
        and exp server-side before trusting any claim.
      </Text>
      <View style={styles.claimsBox}>
        {INTERESTING_CLAIMS.map((key) => {
          const value = claims[key];
          if (value === undefined) return null;
          return (
            <View key={key} style={styles.claimRow}>
              <Text style={styles.claimKey}>{key}</Text>
              <Text style={styles.claimValue} numberOfLines={2}>
                {formatClaim(key, value)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function formatClaim(key: string, value: unknown): string {
  if (key === 'iat' || key === 'exp') {
    const date = new Date(Number(value) * 1000);
    return `${value} (${date.toLocaleString()})`;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// ─── Authorization result card ──────────────────────────────────────────────

function AuthorizationCard({ result }: { result: AuthorizationResult }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Authorization result</Text>
      <View>
        <Text style={styles.label}>Granted scopes</Text>
        <View style={styles.scopeChipRow}>
          {result.grantedScopes.length > 0 ? (
            result.grantedScopes.map((scope) => (
              <View key={scope} style={styles.scopeChipGranted}>
                <Text style={styles.scopeChipGrantedText}>
                  {scope.split('/').pop()}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.cardBody}>(none)</Text>
          )}
        </View>
      </View>
      <Text style={styles.label}>Access token</Text>
      <Text style={styles.tokenText} numberOfLines={2} ellipsizeMode="middle">
        {result.accessToken ?? '—'}
      </Text>
      {result.serverAuthCode && (
        <>
          <Text style={styles.label}>Server auth code</Text>
          <Text style={styles.tokenText} numberOfLines={2} ellipsizeMode="middle">
            {result.serverAuthCode}
          </Text>
        </>
      )}
    </View>
  );
}

// ─── Scope picker ───────────────────────────────────────────────────────────

function ScopePicker({
  selected,
  onToggle,
  customInput,
  onCustomInputChange,
  onAddCustom,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
  customInput: string;
  onCustomInputChange: (text: string) => void;
  onAddCustom: () => void;
}) {
  // Anything selected that isn't in the preset list is "custom".
  const presetIds = new Set(AVAILABLE_SCOPES.map((s) => s.id));
  const customScopes = Array.from(selected).filter((id) => !presetIds.has(id));

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.label}>Scopes to request</Text>
      <View style={styles.scopeChipRow}>
        {AVAILABLE_SCOPES.map((scope) => {
          const active = selected.has(scope.id);
          return (
            <Pressable
              key={scope.id}
              onPress={() => onToggle(scope.id)}
              style={[styles.scopeChip, active && styles.scopeChipActive]}
            >
              <Text
                style={[
                  styles.scopeChipText,
                  active && styles.scopeChipTextActive,
                ]}
              >
                {scope.label}
              </Text>
            </Pressable>
          );
        })}
        {customScopes.map((scope) => (
          <Pressable
            key={scope}
            onPress={() => onToggle(scope)}
            style={[styles.scopeChip, styles.scopeChipActive]}
          >
            <Text style={[styles.scopeChipText, styles.scopeChipTextActive]}>
              {shortLabel(scope)} ✕
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Add a custom scope</Text>
      <View style={styles.customScopeRow}>
        <TextInput
          value={customInput}
          onChangeText={onCustomInputChange}
          placeholder="https://www.googleapis.com/auth/…"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.customScopeInput}
          onSubmitEditing={onAddCustom}
          returnKeyType="done"
        />
        <Pressable
          onPress={onAddCustom}
          disabled={customInput.trim().length === 0}
          style={({ pressed }) => [
            styles.customScopeAdd,
            (pressed || customInput.trim().length === 0) && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.customScopeAddText}>Add</Text>
        </Pressable>
      </View>
      <Text style={styles.helpFootnote}>
        Paste any Google scope URL (
        <Text style={{ fontFamily: 'Courier' }}>
          https://www.googleapis.com/auth/...
        </Text>
        ). Tap a chip to remove. The scope must be added to your OAuth consent
        screen and its API enabled in your Cloud project to actually work.
      </Text>
    </View>
  );
}

function shortLabel(scopeUrl: string): string {
  // Trim down a full scope URL to just the last segment for readability.
  const m = scopeUrl.match(/\/([^/]+)$/);
  return m ? m[1] : scopeUrl;
}

// ─── API result card ────────────────────────────────────────────────────────

function ApiResultCard({ data }: { data: Record<string, unknown> }) {
  return (
    <View style={styles.apiBox}>
      <Text style={styles.label}>API response</Text>
      <Text style={styles.codeText}>{JSON.stringify(data, null, 2)}</Text>
    </View>
  );
}

// ─── Small primitives ──────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value ?? '—'}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  variant,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.buttonPrimary : styles.buttonSecondary,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' && styles.buttonTextSecondary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── JWT decoder (client-side only, for inspection) ─────────────────────────

function decodeJwtPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    // `atob` is available in Hermes / modern RN runtimes.
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ─── Styles ────────────────────────────────────────────────────────────────

const COLORS = {
  bg: '#F7F8FA',
  card: '#FFFFFF',
  primary: '#1A73E8',
  primaryFaint: '#E8F0FE',
  text: '#111827',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  faintBg: '#F3F4F6',
  success: '#10B981',
  danger: '#DC2626',
  codeBg: '#0F172A',
  codeText: '#E2E8F0',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 4,
    lineHeight: 20,
  },

  // Stepper
  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  stepperItem: { flex: 1, alignItems: 'center', position: 'relative' },
  stepperDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepperDotActive: { backgroundColor: COLORS.primary },
  stepperDotDone: { backgroundColor: COLORS.success },
  stepperDotText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  stepperDotTextActive: { color: '#FFFFFF' },
  stepperLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 6,
    fontWeight: '500',
  },
  stepperLabelActive: { color: COLORS.text, fontWeight: '700' },
  stepperLine: {
    position: 'absolute',
    top: 14,
    left: '60%',
    right: '-40%',
    height: 2,
    backgroundColor: COLORS.border,
    zIndex: 1,
  },
  stepperLineDone: { backgroundColor: COLORS.success },

  // Section
  section: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionBadge: {
    backgroundColor: COLORS.primaryFaint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sectionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  sectionBody: { fontSize: 14, color: COLORS.textMuted, lineHeight: 20 },

  // Cards (user, authorization)
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 18,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  cardBody: { fontSize: 14, color: COLORS.textMuted, lineHeight: 20 },

  // User row
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.faintBg,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 22, fontWeight: '600', color: COLORS.textMuted },
  userName: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  userEmail: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

  // Field grid (givenName / familyName / phone)
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: COLORS.faintBg,
    borderRadius: 8,
    padding: 10,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  fieldValue: { fontSize: 13, color: COLORS.text },

  // Labels / tokens
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tokenText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.text,
    backgroundColor: COLORS.faintBg,
    padding: 10,
    borderRadius: 8,
  },

  // Claims table
  claimsBox: {
    backgroundColor: COLORS.faintBg,
    borderRadius: 8,
    paddingVertical: 4,
    marginTop: 4,
  },
  claimRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  claimKey: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    width: 110,
  },
  claimValue: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.text,
    flex: 1,
  },

  // Scope picker
  scopeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scopeChip: {
    backgroundColor: COLORS.faintBg,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  scopeChipActive: {
    backgroundColor: COLORS.primaryFaint,
    borderColor: COLORS.primary,
  },
  scopeChipText: { fontSize: 12, color: COLORS.textMuted, fontFamily: 'Courier' },
  scopeChipTextActive: { color: COLORS.primary, fontWeight: '700' },
  scopeChipGranted: {
    backgroundColor: COLORS.success,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  scopeChipGrantedText: { fontSize: 12, color: '#FFFFFF', fontFamily: 'Courier' },

  customScopeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  customScopeInput: {
    flex: 1,
    backgroundColor: COLORS.faintBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.text,
  },
  customScopeAdd: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customScopeAddText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

  // Code block
  codeBlock: {
    backgroundColor: COLORS.codeBg,
    borderRadius: 8,
    padding: 12,
  },
  codeText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.codeText,
    lineHeight: 18,
  },

  // API result
  apiBox: {
    backgroundColor: COLORS.codeBg,
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },

  // Helpers
  helpFootnote: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.danger,
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
  },

  // Buttons
  button: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: COLORS.primary },
  buttonSecondary: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  buttonTextSecondary: { color: COLORS.text },

  // Status
  statusBox: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: COLORS.primaryFaint,
    borderRadius: 10,
  },
  statusText: { fontSize: 13, color: COLORS.primary, fontWeight: '500' },
});

/**
 * Example app for expo-google-credential-auth.
 *
 * Demonstrates the full sign-in lifecycle:
 *   1. configure({ webClientId }) — call once at app startup
 *   2. signIn({ nonce? })         — show the Google account picker
 *   3. signOut()                  — clear the local credential state
 *
 * The signed-in user is held in plain React state. In a real app you'd
 * lift this into a context / store and persist it (e.g. SecureStore).
 */

import GoogleAuth, {
  GoogleUser,
  SignInResult,
} from 'expo-google-credential-auth';
import { useState } from 'react';
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
  View,
} from 'react-native';

// ─── 1. Configure once at module load ───────────────────────────────────────
// `webClientId` is the *Web* OAuth client ID from Google Cloud Console
// (not the Android one). The Android client must also exist with your
// package name + SHA-1, but you don't reference it in code.
// Replace with your own Web OAuth client ID from Google Cloud Console.
// See the project README for the full setup (Android + Web clients, SHA-1).
GoogleAuth.configure({
  webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
});

export default function App() {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastEvent, setLastEvent] = useState<string>('Ready');

  async function handleSignIn() {
    setLoading(true);
    try {
      // A fresh per-attempt nonce is good practice — your backend can
      // verify it appears as the `nonce` claim in the returned ID token.
      const nonce = `nonce-${Date.now()}`;
      const result: SignInResult = await GoogleAuth.signIn({ nonce });

      // `result.type` discriminates the union — TS narrows the rest.
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
      setLastEvent(`Error: ${e.code ?? ''} ${e.message}`);
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
      setLastEvent('Signed out');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Google Credential Auth</Text>
        <Text style={styles.subtitle}>
          Modern Android sign-in via the Credential Manager API
        </Text>

        {user ? (
          <SignedInCard user={user} idToken={idToken} />
        ) : (
          <SignedOutCard />
        )}

        <View style={styles.buttonRow}>
          {user ? (
            <ActionButton
              label="Sign out"
              variant="secondary"
              onPress={handleSignOut}
              disabled={loading}
            />
          ) : (
            <ActionButton
              label="Sign in with Google"
              variant="primary"
              onPress={handleSignIn}
              disabled={loading}
            />
          )}
        </View>

        <View style={styles.statusBox}>
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.statusText}>{lastEvent}</Text>
          )}
        </View>

        <HelpSection />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── UI building blocks ─────────────────────────────────────────────────────

function SignedInCard({
  user,
  idToken,
}: {
  user: GoogleUser;
  idToken: string | null;
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

      <Text style={styles.label}>ID Token (decode at jwt.io)</Text>
      <Text style={styles.tokenText} numberOfLines={3} ellipsizeMode="middle">
        {idToken}
      </Text>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value ?? '—'}</Text>
    </View>
  );
}

function SignedOutCard() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Not signed in</Text>
      <Text style={styles.cardBody}>
        Tap the button below to launch Google&apos;s Credential Manager
        sheet. On a returning device this will auto-sign-in silently
        (one-tap).
      </Text>
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
        (pressed || disabled) && { opacity: 0.7 },
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

function HelpSection() {
  return (
    <View style={styles.helpBox}>
      <Text style={styles.helpTitle}>How this works</Text>
      <HelpRow
        n="1"
        text="configure() stores your Web OAuth client ID. Call once at startup."
      />
      <HelpRow
        n="2"
        text="signIn() first tries silent / one-tap for returning users. If none, it shows the full Google account picker."
      />
      <HelpRow
        n="3"
        text="On success you get an ID token (a JWT). Send it to your backend for verification — never trust it client-side alone."
      />
      <HelpRow
        n="4"
        text="signOut() clears Credential Manager's auto-select hint. The Google account itself stays on the device."
      />
    </View>
  );
}

function HelpRow({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.helpRow}>
      <View style={styles.helpBullet}>
        <Text style={styles.helpBulletText}>{n}</Text>
      </View>
      <Text style={styles.helpRowText}>{text}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8FA' },
  container: { padding: 20, gap: 16 },
  title: { fontSize: 26, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 4 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  cardBody: { fontSize: 14, color: '#4B5563', lineHeight: 20 },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E5E7EB' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 22, fontWeight: '600', color: '#6B7280' },
  userName: { fontSize: 17, fontWeight: '600', color: '#111' },
  userEmail: { fontSize: 13, color: '#6B7280', marginTop: 2 },

  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  field: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 10,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 13,
    color: '#111',
  },

  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tokenText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: '#374151',
    backgroundColor: '#F3F4F6',
    padding: 10,
    borderRadius: 8,
  },

  buttonRow: { gap: 10 },
  button: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: '#1A73E8' },
  buttonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  buttonTextSecondary: { color: '#111' },

  statusBox: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
  },
  statusText: { fontSize: 13, color: '#3730A3' },

  helpBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    gap: 12,
    marginTop: 8,
  },
  helpTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 4 },
  helpRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  helpBullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBulletText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  helpRowText: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 19 },
});

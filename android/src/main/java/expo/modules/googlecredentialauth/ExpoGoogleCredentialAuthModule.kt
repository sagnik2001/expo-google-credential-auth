package expo.modules.googlecredentialauth

import android.app.Activity
import android.content.IntentSender
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.Scope
import com.google.android.gms.tasks.Task
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val AUTH_REQUEST_CODE = 9821

class NotConfiguredException :
  CodedException("Call configure({ webClientId }) before signIn()")

class NoActivityException :
  CodedException("No current activity — is the app in the foreground?")

class AuthorizationException(message: String) : CodedException(message)

private suspend fun requestGoogleCredential(
  credentialManager: CredentialManager,
  activity: Activity,
  clientId: String,
  filterByAuthorizedAccounts: Boolean,
  autoSelectEnabled: Boolean,
  nonce: String?
): GetCredentialResponse {
  val option = GetGoogleIdOption.Builder()
    .setServerClientId(clientId)
    .setFilterByAuthorizedAccounts(filterByAuthorizedAccounts)
    .setAutoSelectEnabled(autoSelectEnabled)
    .apply { if (nonce != null) setNonce(nonce) }
    .build()
  val request = GetCredentialRequest.Builder()
    .addCredentialOption(option)
    .build()
  return credentialManager.getCredential(activity, request)
}

private fun toSuccessMap(response: GetCredentialResponse): Map<String, Any?> {
  val credential = response.credential
  if (credential is CustomCredential &&
    credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
  ) {
    val googleCred = GoogleIdTokenCredential.createFrom(credential.data)
    return mapOf(
      "type" to "success",
      "idToken" to googleCred.idToken,
      "user" to mapOf(
        "email" to googleCred.id,
        "name" to googleCred.displayName,
        "givenName" to googleCred.givenName,
        "familyName" to googleCred.familyName,
        "phoneNumber" to googleCred.phoneNumber,
        "photo" to googleCred.profilePictureUri?.toString()
      )
    )
  }
  throw CodedException("Unexpected credential type: ${credential.type}")
}

private suspend fun <T> Task<T>.awaitTask(): T = suspendCancellableCoroutine { cont ->
  addOnCompleteListener { t ->
    if (t.isSuccessful) cont.resume(t.result)
    else cont.resumeWithException(t.exception ?: RuntimeException("Task failed"))
  }
}

class ExpoGoogleCredentialAuthModule : Module() {
  private var webClientId: String? = null
  // Holds the in-flight authorization continuation while the user is on the
  // Google consent screen. The PendingIntent we launch comes back through
  // OnActivityResult; we resume the continuation there.
  private var pendingAuthContinuation: CancellableContinuation<AuthorizationResult>? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoGoogleCredentialAuth")

    Function("configure") { options: Map<String, Any?> ->
      webClientId = options["webClientId"] as? String
        ?: throw CodedException("webClientId is required")
    }

    AsyncFunction("signIn") Coroutine { options: Map<String, Any?>? ->
      val clientId = webClientId ?: throw NotConfiguredException()
      val activity = appContext.currentActivity ?: throw NoActivityException()
      val credentialManager = CredentialManager.create(activity)
      val nonce = options?.get("nonce") as? String

      try {
        val response = requestGoogleCredential(
          credentialManager, activity, clientId,
          filterByAuthorizedAccounts = true,
          autoSelectEnabled = true,
          nonce = nonce
        )
        toSuccessMap(response)
      } catch (e: NoCredentialException) {
        try {
          val response = requestGoogleCredential(
            credentialManager, activity, clientId,
            filterByAuthorizedAccounts = false,
            autoSelectEnabled = false,
            nonce = nonce
          )
          toSuccessMap(response)
        } catch (e2: GetCredentialCancellationException) {
          mapOf("type" to "cancelled")
        } catch (e2: NoCredentialException) {
          mapOf("type" to "noSavedCredentialFound")
        }
      } catch (e: GetCredentialCancellationException) {
        mapOf("type" to "cancelled")
      }
    }

    AsyncFunction("signOut") Coroutine { ->
      val activity = appContext.currentActivity ?: throw NoActivityException()
      val credentialManager = CredentialManager.create(activity)
      credentialManager.clearCredentialState(ClearCredentialStateRequest())
      null
    }

    // Authorization flow — separate from sign-in. Requests scoped access
    // tokens (and optionally an offline-access server auth code) via
    // Google Identity Services' AuthorizationClient.
    AsyncFunction("requestAuthorization") Coroutine { options: Map<String, Any?> ->
      val activity = appContext.currentActivity ?: throw NoActivityException()
      @Suppress("UNCHECKED_CAST")
      val scopes = (options["scopes"] as? List<String>)
        ?: throw CodedException("scopes is required and must be a string array")
      if (scopes.isEmpty()) throw CodedException("scopes must contain at least one scope")
      val offlineAccess = options["offlineAccess"] as? Boolean ?: false

      val builder = AuthorizationRequest.Builder()
        .setRequestedScopes(scopes.map { Scope(it) })
      if (offlineAccess) {
        val clientId = webClientId ?: throw NotConfiguredException()
        builder.requestOfflineAccess(clientId)
      }
      val request = builder.build()
      val authClient = Identity.getAuthorizationClient(activity)
      val initial = authClient.authorize(request).awaitTask()

      // If the user hasn't granted these scopes yet, the result carries a
      // PendingIntent that launches Google's consent UI. We have to launch
      // it as an activity-for-result and wait for the callback.
      val resolved = if (initial.hasResolution()) {
        val pi = initial.pendingIntent
          ?: throw AuthorizationException("hasResolution() but no pendingIntent")
        awaitAuthorizationResolution(activity, pi.intentSender)
      } else {
        initial
      }

      mapOf(
        "accessToken" to resolved.accessToken,
        "grantedScopes" to resolved.grantedScopes,
        "serverAuthCode" to resolved.serverAuthCode
      )
    }

    // Revokes the OAuth grant on Google's side. Accepts an access token or
    // refresh token (ID tokens are NOT revocable). After revoke the user
    // will see the consent screen again on next requestAuthorization.
    AsyncFunction("revokeAccess") Coroutine { token: String ->
      withContext(Dispatchers.IO) {
        val url = URL(
          "https://oauth2.googleapis.com/revoke?token=${URLEncoder.encode(token, "UTF-8")}"
        )
        val conn = url.openConnection() as HttpURLConnection
        try {
          conn.requestMethod = "POST"
          conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
          conn.doOutput = true
          conn.outputStream.use { it.write(ByteArray(0)) }
          val code = conn.responseCode
          if (code !in 200..299) {
            val body = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
            // Google returns 400 / invalid_token when the token is already
            // unknown to its servers (expired, never-was, or previously
            // revoked). That's functionally identical to "already revoked" —
            // we don't fail the call.
            val alreadyDead =
              code == 400 && body.contains("invalid_token", ignoreCase = true)
            if (!alreadyDead) {
              throw CodedException("Revoke failed with HTTP $code: $body")
            }
          }
        } finally {
          conn.disconnect()
        }
      }

      // Local cleanup. Important: AuthorizationClient caches the granted
      // AuthorizationResult on the device. If we only revoke server-side,
      // Android will keep returning the cached (now-dead) token on next
      // authorize() with no consent screen. The legacy GoogleSignInClient
      // is the only known way to clear that local Play Services cache —
      // deprecated for sign-in but still works as a cache-buster here.
      val activity = appContext.currentActivity
      if (activity != null) {
        // Throw every known cache-clear at the wall — different Google APIs
        // back onto different caches and none has documented authority over
        // AuthorizationClient's stash. We do best-effort on all of them.
        try {
          CredentialManager.create(activity)
            .clearCredentialState(ClearCredentialStateRequest())
        } catch (_: Exception) {}

        try {
          Identity.getSignInClient(activity).signOut().awaitTask()
        } catch (_: Exception) {}

        try {
          val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .build()
          GoogleSignIn.getClient(activity, gso).revokeAccess().awaitTask()
        } catch (_: Exception) {}

        // Last resort: tell Android's AccountManager to invalidate the token.
        // This is the original Android OAuth caching layer that Play Services
        // is built on top of.
        try {
          val am = android.accounts.AccountManager.get(activity.applicationContext)
          am.invalidateAuthToken("com.google", token)
        } catch (_: Exception) {}
      }
      null
    }

    // Bridges Google's PendingIntent result back into the suspending
    // requestAuthorization coroutine. Filtered by our own request code so
    // we don't steal unrelated results.
    OnActivityResult { activity, payload ->
      if (payload.requestCode != AUTH_REQUEST_CODE) return@OnActivityResult
      val cont = pendingAuthContinuation ?: return@OnActivityResult
      pendingAuthContinuation = null
      try {
        val result = Identity.getAuthorizationClient(activity)
          .getAuthorizationResultFromIntent(payload.data)
        cont.resume(result)
      } catch (e: Exception) {
        cont.resumeWithException(
          AuthorizationException(e.message ?: "Authorization failed")
        )
      }
    }
  }

  private suspend fun awaitAuthorizationResolution(
    activity: Activity,
    intentSender: IntentSender
  ): AuthorizationResult = suspendCancellableCoroutine { cont ->
    if (pendingAuthContinuation != null) {
      cont.resumeWithException(
        AuthorizationException("Another authorization request is already in flight")
      )
      return@suspendCancellableCoroutine
    }
    pendingAuthContinuation = cont
    cont.invokeOnCancellation { pendingAuthContinuation = null }
    try {
      activity.startIntentSenderForResult(
        intentSender,
        AUTH_REQUEST_CODE,
        null, 0, 0, 0
      )
    } catch (e: Exception) {
      pendingAuthContinuation = null
      cont.resumeWithException(
        AuthorizationException(e.message ?: "Failed to launch authorization UI")
      )
    }
  }
}

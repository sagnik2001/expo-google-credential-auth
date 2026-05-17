package expo.modules.googlecredentialauth

import android.app.Activity
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotConfiguredException :
  CodedException("Call configure({ webClientId }) before signIn()")

class NoActivityException :
  CodedException("No current activity — is the app in the foreground?")

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

class ExpoGoogleCredentialAuthModule : Module() {
  private var webClientId: String? = null

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
  }
}

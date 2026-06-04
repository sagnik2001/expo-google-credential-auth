import ExpoModulesCore
import GoogleSignIn
import UIKit



internal final class WebClientIdMissingException: Exception {
  override var reason: String {
    "webClientId is required — call configure({ webClientId, iosClientId })"
  }
}

internal final class NotConfiguredException: Exception {
  override var reason: String {
    "No iOS client ID — pass configure({ iosClientId }) or set GIDClientID in Info.plist"
  }
}

internal final class NoPresentingViewControllerException: Exception {
  override var reason: String {
    "No view controller to present from — is the app in the foreground?"
  }
}

internal final class InvalidScopesException: Exception {
  override var reason: String {
    "scopes is required and must contain at least one scope"
  }
}

internal final class SignInException: GenericException<String> {
  override var reason: String { "Google sign-in failed: \(param)" }
}

internal final class AuthorizationException: GenericException<String> {
  override var reason: String { "Authorization failed: \(param)" }
}

internal final class RevokeException: GenericException<String> {
  override var reason: String { "Revoke failed: \(param)" }
}

// MARK: - Helpers

/// Shapes a `GIDGoogleUser` into the same `{ type: 'success', idToken, user }`
/// dictionary the Android module returns from `signIn`.
private func successPayload(_ user: GIDGoogleUser, idToken: String?) -> [String: Any?] {
  let profile = user.profile
  let photo: String? = (profile?.hasImage ?? false)
    ? profile?.imageURL(withDimension: 320)?.absoluteString
    : nil
  return [
    "type": "success",
    "idToken": idToken ?? user.idToken?.tokenString,
    "user": [
      "email": profile?.email,
      "name": profile?.name,
      "givenName": profile?.givenName,
      "familyName": profile?.familyName,
      // Google Sign-In on iOS never exposes a phone number.
      "phoneNumber": nil,
      "photo": photo
    ] as [String: Any?]
  ]
}

private func isCancelled(_ error: Error) -> Bool {
  let nsError = error as NSError
  return nsError.domain == kGIDSignInErrorDomain
    && nsError.code == GIDSignInError.Code.canceled.rawValue
}

public class ExpoGoogleCredentialAuthModule: Module {
  // The Web OAuth client ID — used as `serverClientID` so the ID token's
  // audience matches your backend and `requestAuthorization` can return a
  // server auth code for offline access.
  private var webClientId: String?
  // The iOS OAuth client ID — required by GoogleSignIn to drive the flow.
  // Has no Android equivalent.
  private var iosClientId: String?

  public func definition() -> ModuleDefinition {
    Name("ExpoGoogleCredentialAuth")

    Function("configure") { (options: [String: Any]) in
      guard let webClientId = options["webClientId"] as? String, !webClientId.isEmpty else {
        throw WebClientIdMissingException()
      }
      self.webClientId = webClientId
      self.iosClientId = options["iosClientId"] as? String
      _ = self.applyConfiguration()
    }

    // Authentication — shows Google's sign-in UI and returns an ID token.
    // Mirrors Android: a silent restore for returning users, falling back to
    // the interactive picker. `nonce` is Android-only and ignored here (the
    // GoogleSignIn iOS SDK doesn't support embedding one).
    AsyncFunction("signIn") { (_ options: [String: Any]?, promise: Promise) in
      guard self.applyConfiguration() else {
        promise.reject(NotConfiguredException())
        return
      }
      DispatchQueue.main.async {
        guard let presentingVC = self.currentViewController() else {
          promise.reject(NoPresentingViewControllerException())
          return
        }
        let signIn = GIDSignIn.sharedInstance
        if signIn.hasPreviousSignIn() {
          signIn.restorePreviousSignIn { user, _ in
            if let user = user {
              promise.resolve(successPayload(user, idToken: nil))
            } else {
              self.presentSignIn(signIn, presentingVC, promise)
            }
          }
        } else {
          self.presentSignIn(signIn, presentingVC, promise)
        }
      }
    }

    // Clears the local session. The iOS analogue of clearing Credential
    // Manager's auto-select hint: the next signIn() shows the picker again.
    AsyncFunction("signOut") { (promise: Promise) in
      DispatchQueue.main.async {
        GIDSignIn.sharedInstance.signOut()
        promise.resolve(nil)
      }
    }

    // Authorization — requests OAuth scopes and returns an access token (and,
    // when a server client ID is configured, a one-time server auth code).
    AsyncFunction("requestAuthorization") { (options: [String: Any], promise: Promise) in
      guard let scopes = options["scopes"] as? [String], !scopes.isEmpty else {
        promise.reject(InvalidScopesException())
        return
      }
      guard self.applyConfiguration() else {
        promise.reject(NotConfiguredException())
        return
      }
      DispatchQueue.main.async {
        guard let presentingVC = self.currentViewController() else {
          promise.reject(NoPresentingViewControllerException())
          return
        }
        let signIn = GIDSignIn.sharedInstance

        // Once we have a signed-in user, top up any missing scopes.
        let authorize: (GIDGoogleUser) -> Void = { user in
          let granted = Set(user.grantedScopes ?? [])
          let missing = scopes.filter { !granted.contains($0) }
          if missing.isEmpty {
            self.resolveAuthorization(user, serverAuthCode: nil, promise: promise)
            return
          }
          user.addScopes(missing, presenting: presentingVC) { result, error in
            if let error = error {
              if isCancelled(error) {
                // User dismissed consent — return what's already granted
                // rather than failing the call.
                self.resolveAuthorization(user, serverAuthCode: nil, promise: promise)
              } else {
                promise.reject(AuthorizationException(error.localizedDescription))
              }
              return
            }
            let updated = result?.user ?? user
            self.resolveAuthorization(updated, serverAuthCode: result?.serverAuthCode, promise: promise)
          }
        }

        if let current = signIn.currentUser {
          authorize(current)
        } else if signIn.hasPreviousSignIn() {
          signIn.restorePreviousSignIn { user, _ in
            if let user = user {
              authorize(user)
            } else {
              self.signInForAuthorization(signIn, presentingVC, scopes, promise)
            }
          }
        } else {
          self.signInForAuthorization(signIn, presentingVC, scopes, promise)
        }
      }
    }

    // Revokes the OAuth grant on Google's side, exactly like Android: POST the
    // token to the revoke endpoint, treat 400/invalid_token as already-revoked,
    // then clear local session state.
    AsyncFunction("revokeAccess") { (token: String, promise: Promise) in
      let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? token
      guard let url = URL(string: "https://oauth2.googleapis.com/revoke?token=\(encoded)") else {
        promise.reject(RevokeException("Could not build revoke URL"))
        return
      }
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

      URLSession.shared.dataTask(with: request) { data, response, error in
        if let error = error {
          promise.reject(RevokeException(error.localizedDescription))
          return
        }
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        if !(200...299).contains(code) {
          let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
          // 400 / invalid_token means Google already doesn't know this token
          // (expired, never-was, or previously revoked) — functionally the
          // same as "already revoked", so don't fail.
          let alreadyDead = code == 400 && body.lowercased().contains("invalid_token")
          if !alreadyDead {
            promise.reject(RevokeException("HTTP \(code): \(body)"))
            return
          }
        }
        // Local cleanup so a stale session doesn't linger.
        DispatchQueue.main.async {
          GIDSignIn.sharedInstance.signOut()
          promise.resolve(nil)
        }
      }.resume()
    }
  }

  // MARK: - Private helpers

  /// Sets `GIDSignIn.configuration` from the stored client IDs (falling back to
  /// `GIDClientID` in Info.plist). Returns false if no iOS client ID is known.
  private func applyConfiguration() -> Bool {
    let clientId = iosClientId
      ?? Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String
    guard let clientId = clientId, !clientId.isEmpty else {
      return false
    }
    GIDSignIn.sharedInstance.configuration =
      GIDConfiguration(clientID: clientId, serverClientID: webClientId)
    return true
  }

  private func presentSignIn(
    _ signIn: GIDSignIn,
    _ presentingVC: UIViewController,
    _ promise: Promise
  ) {
    signIn.signIn(withPresenting: presentingVC) { result, error in
      if let error = error {
        if isCancelled(error) {
          promise.resolve(["type": "cancelled"])
        } else {
          promise.reject(SignInException(error.localizedDescription))
        }
        return
      }
      guard let result = result else {
        promise.resolve(["type": "cancelled"])
        return
      }
      promise.resolve(successPayload(result.user, idToken: result.user.idToken?.tokenString))
    }
  }

  private func signInForAuthorization(
    _ signIn: GIDSignIn,
    _ presentingVC: UIViewController,
    _ scopes: [String],
    _ promise: Promise
  ) {
    signIn.signIn(withPresenting: presentingVC, hint: nil, additionalScopes: scopes) { result, error in
      if let error = error {
        if isCancelled(error) {
          promise.reject(AuthorizationException("cancelled"))
        } else {
          promise.reject(AuthorizationException(error.localizedDescription))
        }
        return
      }
      guard let result = result else {
        promise.reject(AuthorizationException("cancelled"))
        return
      }
      self.resolveAuthorization(result.user, serverAuthCode: result.serverAuthCode, promise: promise)
    }
  }

  private func resolveAuthorization(
    _ user: GIDGoogleUser,
    serverAuthCode: String?,
    promise: Promise
  ) {
    promise.resolve([
      "accessToken": user.accessToken.tokenString,
      "grantedScopes": user.grantedScopes ?? [],
      "serverAuthCode": serverAuthCode
    ] as [String: Any?])
  }

  /// The view controller GoogleSignIn presents its UI from. Prefers Expo's
  /// utility, with a key-window fallback.
  private func currentViewController() -> UIViewController? {
    if let vc = appContext?.utilities?.currentViewController() {
      return vc
    }
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }?
      .rootViewController
  }
}

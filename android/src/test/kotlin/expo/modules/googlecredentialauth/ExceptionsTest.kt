package expo.modules.googlecredentialauth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for the module's exception types. These run on the JVM (no
 * Android emulator needed) via:
 *
 *   cd example/android && ./gradlew :expo-google-credential-auth:testDebugUnitTest
 *
 * The point isn't deep behavior coverage — the module is mostly thin glue
 * over Google's SDK. The point is to lock down the error contract that JS
 * consumers depend on: same message text, same exception identity. Renaming
 * an exception class breaks every consumer that switched on `e.code` to
 * handle errors gracefully.
 */
class ExceptionsTest {
  @Test
  fun `NotConfiguredException carries the expected message`() {
    val e = NotConfiguredException()
    assertEquals(
      "Call configure({ webClientId }) before signIn()",
      e.message,
    )
  }

  @Test
  fun `NoActivityException carries the expected message`() {
    val e = NoActivityException()
    assertTrue(
      "Message should mention the foreground requirement, got: ${e.message}",
      e.message?.contains("foreground") == true,
    )
  }

  @Test
  fun `AuthorizationException preserves the message it was created with`() {
    val e = AuthorizationException("scopes is required")
    assertEquals("scopes is required", e.message)
  }

  @Test
  fun `exceptions are distinct types JS can switch on by code`() {
    // If these ever collapse to the same class, JS consumers that handle
    // each scenario separately would all fall into the same catch branch.
    val notConfigured: Throwable = NotConfiguredException()
    val noActivity: Throwable = NoActivityException()
    val authFailed: Throwable = AuthorizationException("x")

    assertTrue(notConfigured::class != noActivity::class)
    assertTrue(noActivity::class != authFailed::class)
    assertTrue(notConfigured::class != authFailed::class)
  }
}

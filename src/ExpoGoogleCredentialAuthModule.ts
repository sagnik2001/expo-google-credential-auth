import { NativeModule, requireNativeModule } from 'expo';

import {
  AuthorizationResult,
  ConfigureOptions,
  RequestAuthorizationOptions,
  SignInOptions,
  SignInResult,
} from './ExpoGoogleCredentialAuth.types';

declare class ExpoGoogleCredentialAuthModule extends NativeModule {
  configure(options: ConfigureOptions): void;
  signIn(options?: SignInOptions): Promise<SignInResult>;
  signOut(): Promise<void>;
  requestAuthorization(
    options: RequestAuthorizationOptions,
  ): Promise<AuthorizationResult>;
  revokeAccess(accessToken: string): Promise<void>;
}

export default requireNativeModule<ExpoGoogleCredentialAuthModule>('ExpoGoogleCredentialAuth');

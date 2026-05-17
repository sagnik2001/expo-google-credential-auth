import { NativeModule, requireNativeModule } from 'expo';

import { ConfigureOptions, SignInOptions, SignInResult } from './ExpoGoogleCredentialAuth.types';

declare class ExpoGoogleCredentialAuthModule extends NativeModule {
  configure(options: ConfigureOptions): void;
  signIn(options?: SignInOptions): Promise<SignInResult>;
  signOut(): Promise<void>;
}

export default requireNativeModule<ExpoGoogleCredentialAuthModule>('ExpoGoogleCredentialAuth');

import { NativeModule, requireNativeModule } from 'expo';

import { ExpoGoogleCredentialAuthModuleEvents } from './ExpoGoogleCredentialAuth.types';

declare class ExpoGoogleCredentialAuthModule extends NativeModule<ExpoGoogleCredentialAuthModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoGoogleCredentialAuthModule>('ExpoGoogleCredentialAuth');

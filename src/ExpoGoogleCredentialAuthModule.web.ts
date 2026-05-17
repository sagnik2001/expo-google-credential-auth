import { registerWebModule, NativeModule } from 'expo';

import { ExpoGoogleCredentialAuthModuleEvents } from './ExpoGoogleCredentialAuth.types';

class ExpoGoogleCredentialAuthModule extends NativeModule<ExpoGoogleCredentialAuthModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ExpoGoogleCredentialAuthModule, 'ExpoGoogleCredentialAuthModule');

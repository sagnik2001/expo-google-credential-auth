import { requireNativeView } from 'expo';
import * as React from 'react';

import { ExpoGoogleCredentialAuthViewProps } from './ExpoGoogleCredentialAuth.types';

const NativeView: React.ComponentType<ExpoGoogleCredentialAuthViewProps> =
  requireNativeView('ExpoGoogleCredentialAuth');

export default function ExpoGoogleCredentialAuthView(props: ExpoGoogleCredentialAuthViewProps) {
  return <NativeView {...props} />;
}

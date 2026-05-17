import * as React from 'react';

import { ExpoGoogleCredentialAuthViewProps } from './ExpoGoogleCredentialAuth.types';

export default function ExpoGoogleCredentialAuthView(props: ExpoGoogleCredentialAuthViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}

// Reexport the native module. On web, it will be resolved to ExpoGoogleCredentialAuthModule.web.ts
// and on native platforms to ExpoGoogleCredentialAuthModule.ts
export { default } from './ExpoGoogleCredentialAuthModule';
export { default as ExpoGoogleCredentialAuthView } from './ExpoGoogleCredentialAuthView';
export * from  './ExpoGoogleCredentialAuth.types';

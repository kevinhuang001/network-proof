import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for NetProof Air.
 *
 * The device is meant to live in airplane mode forever, so this app has no
 * network permissions, no server URL and no live reload in production builds.
 * `webContentsDebuggingEnabled` is on only in debug builds.
 */
const config: CapacitorConfig = {
  appId: 'io.netproof.air',
  appName: 'NetProof Air',
  webDir: 'dist',
  android: {
    // The WebView must ask for the camera at runtime; the Android manifest
    // declares CAMERA, and this flag makes Capacitor forward the request.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;

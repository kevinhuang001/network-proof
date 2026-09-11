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
    /*
     * DO NOT turn this on. It is off by default and must stay off.
     *
     * `captureInput: true` makes `CapacitorWebView` return its own
     * `BaseInputConnection(this, false)` instead of the WebView's real input connection,
     * which takes the input method out of Chromium's IME pipeline. Composed text then
     * arrives as `KeyEvent.ACTION_MULTIPLE`, and Capacitor's `dispatchKeyEvent` handles it
     * with:
     *
     *     document.activeElement.value = document.activeElement.value + characters
     *
     * — a native, unconditional append into the focused field, outside React and outside
     * the editing context. A Chinese keyboard composing `clu` delivers `c`, then `cl`, then
     * `clu`, so the field ends up with `c` + `cl` + `clu` = `cclclu`. That is the reported
     * bug, reproduced exactly, and it only ever appeared in the APK because the web build
     * has no Capacitor in it.
     *
     * It exists for hardware keyboard-wedge scanners, which this device does not have. The
     * camera is the only input that matters here.
     */
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;

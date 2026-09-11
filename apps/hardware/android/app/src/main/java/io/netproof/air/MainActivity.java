package io.netproof.air;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

/**
 * NetProof Air entry point.
 *
 * The only native addition to the Capacitor template: asking for the camera at
 * startup, before the WebView ever calls getUserMedia. Capacitor's
 * BridgeWebChromeClient grants RESOURCE_VIDEO only when the app already holds the
 * runtime permission, so requesting it up front is what turns "permission denied"
 * on the first capture attempt into a working entropy harvest.
 */
public class MainActivity extends BridgeActivity {

    private static final int CAMERA_REQUEST = 0x4E50; // "NP"

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestCameraIfNeeded();
    }

    private void requestCameraIfNeeded() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[] { Manifest.permission.CAMERA },
                    CAMERA_REQUEST);
        }
    }
}

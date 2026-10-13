package io.netproof.air;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Installed-APK security invariants; execute on an Android emulator/device. */
@RunWith(AndroidJUnit4.class)
public class AirGapInstrumentedTest {
    private final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Test public void applicationIdNeverChanges() {
        assertEquals("io.netproof.air", app.getPackageName());
    }

    @Test public void requestsCameraButNeverInternet() throws Exception {
        PackageInfo info = app.getPackageManager().getPackageInfo(
            app.getPackageName(), PackageManager.GET_PERMISSIONS);
        List<String> permissions = Arrays.asList(
            info.requestedPermissions == null ? new String[0] : info.requestedPermissions);
        assertTrue(permissions.contains(Manifest.permission.CAMERA));
        assertFalse(permissions.contains(Manifest.permission.INTERNET));
        assertFalse(permissions.contains(Manifest.permission.ACCESS_WIFI_STATE));
    }

    @Test public void androidBackupsAreDisabled() throws Exception {
        ApplicationInfo info = app.getPackageManager().getApplicationInfo(
            app.getPackageName(), 0);
        assertEquals(0, info.flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
    }
}

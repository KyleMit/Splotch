package art.splotch.app;

import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Splotch is a full-screen kids' drawing app, so we hide the Android system
 * navigation bar to give the canvas the whole screen and to stop little fingers
 * from accidentally navigating away.
 *
 * <p>The bar is hidden with immersive-sticky behaviour: it stays gone but can be
 * swiped back temporarily. A transparent background lets the app color show
 * through, with the system contrast scrim keeping three-button navigation
 * legible over drawings. AndroidX enables edge-to-edge; Capacitor handles the
 * WebView insets and the CSS Notch Band paints the cutout.
 *
 * <p>AndroidX owns the version-specific display-cutout policy, letting the
 * canvas and CSS Notch Band extend under the hole-punch across rotations.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceLockPlugin.class);
        registerPlugin(ColoringPacksPlugin.class);
        registerPlugin(SystemBackPlugin.class);
        registerPlugin(PhotoLibraryPlugin.class);
        registerPlugin(AppSettingsPlugin.class);
        registerPlugin(SensorOrientationPlugin.class);
        super.onCreate(savedInstanceState);
        WindowCompat.enableEdgeToEdge(getWindow());
        preserveNavigationBarContrast();
        updateWebViewBackground();
        hideNavigationBar();
    }

    private void preserveNavigationBarContrast() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(true);
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        updateWebViewBackground();
    }

    private void updateWebViewBackground() {
        TypedValue backgroundColor = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.colorBackground, backgroundColor, true);
        bridge.getWebView().setBackgroundColor(backgroundColor.data);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Re-apply when focus returns (e.g. after the keyboard or a dialog),
        // otherwise the system restores the nav bar.
        if (hasFocus) {
            hideNavigationBar();
        }
    }

    private void hideNavigationBar() {
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.navigationBars());
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}

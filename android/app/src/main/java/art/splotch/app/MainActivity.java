package art.splotch.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

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
 * swiped back temporarily. Its background is made transparent so that, while it
 * is transiently shown, the app's own content (the "app color") shows through
 * the cutout instead of a jarring black/white system bar. On Android 15+
 * (API 35+) edge-to-edge is enforced by the system, so the app already draws
 * behind that area; on older devices the transparent color provides the same
 * effect.
 *
 * <p>We also opt the window into the display cutout on the short edges so the
 * canvas extends under the hole-punch. In landscape the device's physical top
 * rotates to a side, so this is what lets the Notch Band paint the cutout there
 * (and the WebView reclaim that strip) instead of the system letterboxing it.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceLockPlugin.class);
        super.onCreate(savedInstanceState);
        drawUnderDisplayCutout();
        hideNavigationBar();
    }

    private void drawUnderDisplayCutout() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams params = getWindow().getAttributes();
            params.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(params);
        }
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
        // Let the app paint into the nav-bar cutout so its color shows through.
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.navigationBars());
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}

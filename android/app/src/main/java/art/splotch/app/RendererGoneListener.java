package art.splotch.app;

import android.app.Activity;
import android.content.Intent;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.WebViewListener;

/**
 * Android WebView draws the page in its own renderer process, and the low-memory killer reaches
 * that process first while Splotch is cached (oom_score_adj 900 against the app's 850, measured on
 * a Galaxy S21 FE). When no listener claims the death, WebView kills the whole app. This claims it
 * and starts the activity afresh in a cleared task, which builds a new bridge and WebView exactly as
 * a launch does, so the app stays open and the page reloads with its drawing checkpoint (ADR-0178).
 * An in-place `recreate()` was tried first: on an API 36 emulator the recreated page logged
 * Capacitor's "Error injecting safe area CSS" and laid out 24 dp shorter than a launch, so the
 * checkpoint, saved at the launch size, was refused.
 *
 * <p>A renderer that dies again soon after a recreation is left to WebView's default, which ends
 * the process, rather than recreating in a loop.
 */
final class RendererGoneListener extends WebViewListener {
    // Longer than a cold page load on a slow phone, so a renderer that crashes while loading is
    // counted as the same failure.
    private static final long RECREATION_LOOP_WINDOW_MS = 10_000;

    // Process-wide on purpose: the relaunched activity registers a new listener, and the guard must
    // see the relaunch the previous one started.
    private static long lastRecreationMs = -RECREATION_LOOP_WINDOW_MS;

    private final Activity activity;

    RendererGoneListener(Activity activity) {
        this.activity = activity;
    }

    @Override
    public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
        long now = SystemClock.elapsedRealtime();
        if (now - lastRecreationMs < RECREATION_LOOP_WINDOW_MS) return false;
        lastRecreationMs = now;
        // The dead WebView can no longer be used, so it leaves the hierarchy before anything draws it.
        if (webView.getParent() instanceof ViewGroup) {
            ((ViewGroup) webView.getParent()).removeView(webView);
        }
        webView.destroy();
        Intent relaunch = new Intent(activity, activity.getClass())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        activity.startActivity(relaunch);
        activity.finish();
        return true;
    }
}

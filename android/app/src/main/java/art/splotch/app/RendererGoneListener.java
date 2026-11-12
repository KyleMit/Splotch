package art.splotch.app;

import android.app.Activity;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.WebViewListener;

/**
 * Android WebView draws the page in its own renderer process, and the low-memory killer reaches
 * that process first while Splotch is cached (oom_score_adj 900 against the app's 850, measured on
 * a Galaxy S21 FE). When no listener claims the death, WebView kills the whole app. This claims it
 * and recreates the activity, which builds a fresh bridge and WebView, so the app stays where the
 * child left it and reloads.
 *
 * <p>A renderer that dies again soon after a recreation is left to WebView's default, which ends
 * the process, rather than recreating in a loop.
 */
final class RendererGoneListener extends WebViewListener {
    // Longer than a cold page load on a slow phone, so a renderer that crashes while loading is
    // counted as the same failure.
    private static final long RECREATION_LOOP_WINDOW_MS = 10_000;

    // Process-wide on purpose: the recreated activity registers a new listener, and the guard must
    // see the recreation the previous one started.
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
        activity.recreate();
        return true;
    }
}

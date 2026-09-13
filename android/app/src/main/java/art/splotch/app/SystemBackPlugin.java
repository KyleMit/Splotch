package art.splotch.app;

import android.os.SystemClock;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hands the system Back button and back gesture to the web layer, which decides
 * between closing the top dialog, asking before leaving, and leaving (ADR-0165).
 *
 * <p>The callback goes through the AndroidX dispatcher, which registers an
 * OnBackInvokedCallback on Android 13+ when the platform uses one and falls back
 * to onBackPressed() otherwise, so the same callback runs with or without
 * predictive back.
 *
 * <p>A page subscribes a moment after it starts: the drawing route loads its Back
 * handler after mount, while the canvas already takes strokes before hydration.
 * A Back in that gap is held and delivered when the page subscribes, because the
 * system default finishes the activity, and the drawing, on Android 7 through 11.
 * Once a page has subscribed and then let go (a route without a handler), Back
 * takes the system default again, as it does if no subscription arrives at all.
 */
@CapacitorPlugin(name = "SystemBack")
public class SystemBackPlugin extends Plugin {
    static final String BACK_EVENT = "back";

    // Long enough for a slow device's cold start to reach the drawing route's
    // mount and load its Back handler. Past it, a page that never subscribes
    // (a boot failure) gets the system default rather than a dead Back.
    private static final long SUBSCRIBE_GRACE_MS = 10_000;

    private volatile long pageStartedAtMs;
    private volatile boolean pageSubscribed;

    @Override
    public void load() {
        startWaitingForPage();
        AppCompatActivity activity = getActivity();
        activity.getOnBackPressedDispatcher().addCallback(activity, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (hasListeners(BACK_EVENT) || awaitingPageSubscription()) {
                    // On the bridge thread, where listeners are added, so a Back racing
                    // the subscription is either delivered or retained for it, never lost.
                    bridge.execute(() -> notifyListeners(BACK_EVENT, new JSObject(), true));
                    return;
                }
                setEnabled(false);
                activity.getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    private boolean awaitingPageSubscription() {
        return !pageSubscribed && SystemClock.uptimeMillis() - pageStartedAtMs < SUBSCRIBE_GRACE_MS;
    }

    private void startWaitingForPage() {
        pageSubscribed = false;
        pageStartedAtMs = SystemClock.uptimeMillis();
    }

    @Override
    @PluginMethod(returnType = PluginMethod.RETURN_NONE)
    public void addListener(PluginCall call) {
        if (BACK_EVENT.equals(call.getString("eventName"))) pageSubscribed = true;
        super.addListener(call);
    }

    /** Bridge.reset() calls this when a page starts loading. */
    @Override
    public void removeAllListeners() {
        super.removeAllListeners();
        startWaitingForPage();
    }

    /**
     * Leaves the app the way Back leaves a launcher activity on Android 12+: the
     * task moves behind the home screen and the activity, with its WebView and
     * drawing, stays alive. Called on every API level, so Android 7 through 11,
     * whose default Back finishes the activity, keep the drawing too.
     */
    @PluginMethod
    public void moveToBackground(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().moveTaskToBack(true);
            call.resolve();
        });
    }
}

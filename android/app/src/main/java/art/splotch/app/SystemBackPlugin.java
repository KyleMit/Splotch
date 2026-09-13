package art.splotch.app;

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
 * <p>Back falls through to the system default whenever the page has no listener:
 * before the web layer subscribes, and after a page reload clears every plugin
 * listener (Bridge.reset). A stale enabled callback would otherwise swallow Back
 * with nothing left to answer it.
 */
@CapacitorPlugin(name = "SystemBack")
public class SystemBackPlugin extends Plugin {
    static final String BACK_EVENT = "back";

    @Override
    public void load() {
        AppCompatActivity activity = getActivity();
        activity.getOnBackPressedDispatcher().addCallback(activity, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (hasListeners(BACK_EVENT)) {
                    notifyListeners(BACK_EVENT, new JSObject());
                    return;
                }
                setEnabled(false);
                activity.getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
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

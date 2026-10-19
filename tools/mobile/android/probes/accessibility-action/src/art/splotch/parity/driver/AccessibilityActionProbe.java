package art.splotch.parity.driver;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.graphics.Rect;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public final class AccessibilityActionProbe extends Instrumentation {
    private static final long ROOT_TIMEOUT_MS = 5000;
    private static final long ROOT_POLL_MS = 100;
    private static final int MAX_NODES = 3000;
    private static final int MAX_RESULT_CHARS = 300000;
    private static final int MAX_REFUSAL_CANDIDATES = 16;
    private static final int MAX_ERROR_CHARS = 1024;
    private Bundle arguments;
    private Integer observedDisplay;

    private static final class AmbiguousTarget extends IllegalStateException {
        final String candidates;
        AmbiguousTarget(String message, String candidates) {
            super(message);
            this.candidates = candidates;
        }
    }
    private boolean actionAttempted;

    @Override public void onCreate(Bundle value) {
        super.onCreate(value);
        arguments = value;
        start();
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            result.putString("result", runProbe().toString());
            finish(-1, result);
        } catch (Exception error) {
            result = new Bundle();
            String message = error.getClass().getSimpleName() + ": " + error.getMessage();
            result.putString("error", message.substring(0, Math.min(message.length(), MAX_ERROR_CHARS)));
            if (error instanceof AmbiguousTarget) result.putString("candidates", ((AmbiguousTarget) error).candidates);
            result.putBoolean("inputDispatched", actionAttempted);
            result.putString("outcome", actionAttempted ? "unknown" : "refused");
            finish(0, result);
        }
    }

    private UiAutomation automation() {
        UiAutomation automation = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
        AccessibilityServiceInfo info = automation.getServiceInfo();
        info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        automation.setServiceInfo(info);
        return automation;
    }

    private AccessibilityNodeInfo admittedRoot(UiAutomation automation, String expected) {
        long deadline = SystemClock.uptimeMillis() + ROOT_TIMEOUT_MS;
        AccessibilityNodeInfo root;
        do {
            root = automation.getRootInActiveWindow();
            if (root != null) break;
            SystemClock.sleep(ROOT_POLL_MS);
        } while (SystemClock.uptimeMillis() < deadline);
        if (root == null || !expected.contentEquals(root.getPackageName())) {
            throw new IllegalStateException("Foreground identity is not the admitted package; no input dispatched");
        }
        int windows = 0;
        for (AccessibilityWindowInfo window : automation.getWindows()) {
            if (window.getId() == root.getWindowId()) {
                windows++;
                if (Build.VERSION.SDK_INT >= 30) {
                    observedDisplay = window.getDisplayId();
                    if (observedDisplay != 0) {
                        throw new IllegalStateException("Active accessibility window is not on Display0");
                    }
                }
            }
        }
        if (windows != 1) throw new IllegalStateException("Active accessibility window is not uniquely admitted");
        return root;
    }

    private List<AccessibilityNodeInfo> nodes(AccessibilityNodeInfo root) {
        List<AccessibilityNodeInfo> all = new ArrayList<>();
        all.add(root);
        for (int index = 0; index < all.size(); index++) {
            if (all.size() > MAX_NODES) throw new IllegalStateException("Accessibility tree exceeds probe budget");
            AccessibilityNodeInfo node = all.get(index);
            for (int child = 0; child < node.getChildCount(); child++) {
                AccessibilityNodeInfo next = node.getChild(child);
                if (next != null) all.add(next);
            }
        }
        return all;
    }

    private JSONObject describe(AccessibilityNodeInfo node) throws Exception {
        JSONObject result = new JSONObject();
        boolean redacted = node.isPassword() || node.isEditable();
        result.put("class", String.valueOf(node.getClassName()));
        result.put("text", redacted ? "[editable redacted]" : String.valueOf(node.getText()));
        result.put("description", redacted ? "[editable redacted]" : String.valueOf(node.getContentDescription()));
        result.put("clickable", node.isClickable());
        result.put("focusable", node.isFocusable());
        result.put("importantForAccessibility", node.isImportantForAccessibility());
        result.put("accessibilityFocused", node.isAccessibilityFocused());
        if (Build.VERSION.SDK_INT >= 28) {
            result.put("screenReaderFocusable", node.isScreenReaderFocusable());
            result.put("heading", node.isHeading());
        }
        result.put("enabled", node.isEnabled());
        result.put("visible", node.isVisibleToUser());
        result.put("selected", node.isSelected());
        result.put("checkable", node.isCheckable());
        result.put("checked", node.isChecked());
        result.put("scrollable", node.isScrollable());
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        result.put("bounds", new JSONArray(new int[] {bounds.left, bounds.top, bounds.right, bounds.bottom}));
        JSONArray actions = new JSONArray();
        for (AccessibilityNodeInfo.AccessibilityAction action : node.getActionList()) {
            JSONObject item = new JSONObject();
            item.put("id", action.getId());
            item.put("label", redacted ? "[redacted]" : String.valueOf(action.getLabel()));
            actions.put(item);
        }
        result.put("actions", actions);
        return result;
    }

    private boolean matchesLabel(AccessibilityNodeInfo node, String label) {
        return !node.isEditable() && !node.isPassword() && node.isVisibleToUser() && node.isEnabled()
            && (label.contentEquals(node.getText() == null ? "" : node.getText())
            || label.contentEquals(node.getContentDescription() == null ? "" : node.getContentDescription()));
    }

    private boolean matchesTarget(AccessibilityNodeInfo node, String label, String className) {
        return matchesLabel(node, label) && (className.isEmpty() || className.contentEquals(node.getClassName()));
    }

    private String refusalCandidates(List<AccessibilityNodeInfo> matching) throws Exception {
        JSONObject result = new JSONObject();
        JSONArray candidates = new JSONArray();
        for (int index = 0; index < Math.min(matching.size(), MAX_REFUSAL_CANDIDATES); index++) {
            JSONObject candidate = describe(matching.get(index));
            if (candidates.toString().length() + candidate.toString().length() > MAX_ERROR_CHARS) break;
            candidates.put(candidate);
        }
        result.put("total", matching.size());
        result.put("truncated", candidates.length() != matching.size());
        result.put("nodes", candidates);
        return result.toString();
    }

    private JSONObject runProbe() throws Exception {
        String expected = arguments.getString("expectedPackage", "");
        if (!expected.equals("art.splotch.migration.probe")) {
            throw new IllegalArgumentException("Only the mutable migration probe is admitted");
        }
        String operation = arguments.getString("operation", "inspect");
        if (!operation.equals("inspect") && !operation.equals("click")) {
            throw new IllegalArgumentException("Unknown operation");
        }
        UiAutomation automation = automation();
        AccessibilityNodeInfo root = admittedRoot(automation, expected);
        List<AccessibilityNodeInfo> nodes = nodes(root);
        JSONArray snapshot = new JSONArray();
        List<AccessibilityNodeInfo> matching = new ArrayList<>();
        String label = arguments.getString("label", "");
        String className = arguments.getString("class", "");
        for (AccessibilityNodeInfo node : nodes) {
            snapshot.put(describe(node));
            if (matchesTarget(node, label, className)) matching.add(node);
        }
        JSONObject result = new JSONObject();
        result.put("package", expected);
        result.put("api", Build.VERSION.SDK_INT);
        result.put("display", observedDisplay == null ? JSONObject.NULL : observedDisplay);
        result.put("displayVerifiedByDriver", observedDisplay != null);
        result.put("selector", new JSONObject().put("label", label).put("class", className));
        result.put("nodes", snapshot);
        result.put("inputDispatched", false);
        if (result.toString().length() > MAX_RESULT_CHARS) {
            throw new IllegalStateException("Accessibility result exceeds transport budget; no input dispatched");
        }
        if (operation.equals("click")) {
            if (label.isEmpty() || matching.size() != 1) {
                throw new AmbiguousTarget("Exact enabled visible selector is not unique: " + matching.size(), refusalCandidates(matching));
            }
            AccessibilityNodeInfo target = matching.get(0);
            boolean hasAction = false;
            for (AccessibilityNodeInfo.AccessibilityAction action : target.getActionList()) {
                if (action.getId() == AccessibilityNodeInfo.ACTION_CLICK) hasAction = true;
            }
            result.put("actionListed", hasAction);
            AccessibilityNodeInfo activeRoot = admittedRoot(automation, expected);
            if (!target.refresh() || !expected.contentEquals(target.getPackageName())
                || target.getWindowId() != activeRoot.getWindowId() || !matchesTarget(target, label, className)) {
                throw new IllegalStateException("Target changed before activation; no input dispatched");
            }
            result.put("inputDispatched", true);
            result.put("action", AccessibilityNodeInfo.ACTION_CLICK);
            actionAttempted = true;
            result.put("performed", target.performAction(AccessibilityNodeInfo.ACTION_CLICK));
        }
        return result;
    }
}

import Foundation
import Capacitor
import UIKit

// Surfaces whether Guided Access is currently engaged so the Parent Center can confirm
// the lock is on (green check) and swap its "enable" steps for "exit" steps.
//
// Capacitor 8 does NOT auto-discover plugin classes — registerPlugins() only loads the
// built-ins plus the packageClassList from capacitor.config.json (npm plugin packages).
// An app-local plugin therefore must be registered explicitly; that happens in
// MainViewController.capacitorDidLoad() via bridge.registerPluginInstance.
@objc(DeviceLockPlugin)
public class DeviceLockPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeviceLockPlugin"
    public let jsName = "DeviceLock"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isLocked", returnType: CAPPluginReturnPromise)
    ]

    @objc func isLocked(_ call: CAPPluginCall) {
        // UIAccessibility is UIKit state — read it on the main thread. Capacitor
        // dispatches plugin calls on a background queue, where this can read false.
        DispatchQueue.main.async {
            call.resolve(["locked": UIAccessibility.isGuidedAccessEnabled])
        }
    }
}

import Foundation
import Capacitor
import UIKit

// Forwards the Apple Pencil double-tap (Pencil 2 / Pro) into the web layer so it can toggle
// the eraser, exactly like tapping the on-screen eraser button. The gesture is delivered by
// UIKit's UIPencilInteraction and never surfaces in the WKWebView's PointerEvents, so it has
// to be captured natively here and re-emitted as a "doubleTap" listener event.
//
// Like DeviceLockPlugin, this is an app-local plugin: Capacitor 8 does not auto-discover
// plugin classes, so MainViewController.capacitorDidLoad() registers the instance and calls
// attach(to:) with the web view to install the interaction.
@objc(PencilEraserPlugin)
public class PencilEraserPlugin: CAPPlugin, CAPBridgedPlugin, UIPencilInteractionDelegate {
    public let identifier = "PencilEraserPlugin"
    public let jsName = "PencilEraser"
    // No callable methods — the plugin only emits events the web side subscribes to.
    public let pluginMethods: [CAPPluginMethod] = []

    func attach(to view: UIView) {
        let interaction = UIPencilInteraction()
        interaction.delegate = self
        view.addInteraction(interaction)
    }

    // The classic delegate callback is the only one available down to iOS 15 (the project's
    // deployment target); it still fires on newer iPadOS, so we always interpret a tap as
    // "toggle eraser" regardless of the user's system preferredTapAction.
    public func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        notifyListeners("doubleTap", data: [:])
    }
}

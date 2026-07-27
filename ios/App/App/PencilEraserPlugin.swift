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

    // Deliberately handle every delegate tap ourselves so the plugin always emits "doubleTap" and
    // the web layer toggles the eraser instead of honoring UIPencilInteraction.preferredTapAction.
    public func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        notifyListeners("doubleTap", data: [:])
    }
}

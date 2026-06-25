import Capacitor

// Capacitor 8 only auto-registers its built-in plugins plus the packageClassList that
// `cap sync` writes into capacitor.config.json from installed npm plugin packages — it does
// NOT scan the app binary for plugin classes. So app-local plugins must be registered by
// hand here, in the bridge view controller's post-init hook. Main.storyboard points the
// root view controller at this class (customClass=MainViewController, module=App).
class MainViewController: CAPBridgeViewController {
    // Held strongly because UIPencilInteraction.delegate is weak; the bridge also retains
    // registered plugin instances, but keep our own reference so attach(to:) stays valid.
    private let pencilEraser = PencilEraserPlugin()

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(DeviceLockPlugin())
        bridge?.registerPluginInstance(pencilEraser)
        if let webView = bridge?.webView {
            pencilEraser.attach(to: webView)
        }
    }
}

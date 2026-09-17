import Capacitor
import UIKit

// Opens Splotch's page in the Settings app, where a parent turns Photos access back on after
// declining the add-only prompt a save raises. Registered in MainViewController.capacitorDidLoad()
// (see DeviceLockPlugin for why app-local plugins need that).
@objc(AppSettingsPlugin)
public class AppSettingsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppSettingsPlugin"
    public let jsName = "AppSettings"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.reject("The Settings URL is unavailable")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url) { opened in
                if opened {
                    call.resolve()
                } else {
                    call.reject("Settings did not open")
                }
            }
        }
    }
}

import React
import UIKit

@objc(SplotchGateKeyboardView)
final class SplotchGateKeyboardView: UIView {
  @objc var onGateKey: RCTDirectEventBlock?

  override var canBecomeFirstResponder: Bool { true }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      resignFirstResponder()
    } else {
      DispatchQueue.main.async { [weak self] in
        guard let self, self.window != nil else { return }
        self.becomeFirstResponder()
      }
    }
  }

  override var keyCommands: [UIKeyCommand]? {
    (Array(0...9).map(String.init) + ["\u{8}", "\r"]).map { input in
      let command = UIKeyCommand(input: input, modifierFlags: [], action: #selector(pressed(_:)))
      command.wantsPriorityOverSystemBehavior = true
      return command
    }
  }

  @objc private func pressed(_ command: UIKeyCommand) {
    guard let input = command.input else { return }
    let key = input == "\u{8}" ? "delete" : input == "\r" ? "submit" : input
    onGateKey?(["key": key])
  }
}

@objc(SplotchGateKeyboardManager)
final class SplotchGateKeyboardManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { SplotchGateKeyboardView() }
}

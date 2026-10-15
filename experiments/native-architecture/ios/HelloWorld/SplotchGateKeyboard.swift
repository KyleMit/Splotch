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

@objc(SplotchShortcutKeyboardView)
final class SplotchShortcutKeyboardView: UIView {
  @objc var onShortcutKey: RCTDirectEventBlock?
  @objc var shortcutScope = "drawing"
  @objc var shortcutsEnabled = false {
    didSet {
      if shortcutsEnabled { focusWhenAvailable() }
      else if isFirstResponder { resignFirstResponder() }
    }
  }

  override var canBecomeFirstResponder: Bool { shortcutsEnabled }

  private func firstResponder(in view: UIView) -> UIView? {
    if view.isFirstResponder { return view }
    for child in view.subviews {
      if let responder = firstResponder(in: child) { return responder }
    }
    return nil
  }

  private func focusWhenAvailable() {
    DispatchQueue.main.async { [weak self] in
      guard let self, let window = self.window, self.shortcutsEnabled else { return }
      if let focused = self.firstResponder(in: window), focused !== self,
        focused is UITextInput || focused.isDescendant(of: self) { return }
      self.becomeFirstResponder()
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { resignFirstResponder() }
    else { focusWhenAvailable() }
  }

  override var keyCommands: [UIKeyCommand]? {
    guard shortcutsEnabled else { return [] }
    var commands = [UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(pressed(_:)))]
    let focused = window.flatMap { firstResponder(in: $0) }
    let editing = focused.map { $0 is UITextInput } ?? false
    if shortcutScope == "drawing" && !editing {
      commands += [UIKeyModifierFlags.command, .control].map { modifier in
        UIKeyCommand(input: "z", modifierFlags: modifier, action: #selector(pressed(_:)))
      }
    }
    for command in commands { command.wantsPriorityOverSystemBehavior = true }
    return commands
  }

  @objc private func pressed(_ command: UIKeyCommand) {
    guard shortcutsEnabled, let input = command.input else { return }
    onShortcutKey?(["key": input == UIKeyCommand.inputEscape ? "escape" : "undo"])
  }
}

@objc(SplotchShortcutKeyboardManager)
final class SplotchShortcutKeyboardManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { SplotchShortcutKeyboardView() }
}

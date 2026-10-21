import React
import UIKit

// The shipping dialog backdrop's blur (app.css .modal-dialog::backdrop): a CSS blur() of what lies
// behind the dialog, under the scrim's dim. Inside a transparent React Native Modal it blurs the
// screen and any dialog it was stacked over. UIKit's one public live blur, UIVisualEffectView,
// blurs far harder than shipping, so the effect is held part-way through a paused animator, which
// scales the style's blur radius and its tint together. The requested radius is the CSS blur()
// radius, which WebKit hands Core Animation as the same gaussianBlur radius UIKit's styles use.
@objc(SplotchBackdropBlurView)
final class SplotchBackdropBlurView: UIView {
  // Per paper theme, the style whose tint, scaled down with its blur, left the dimmed paper level
  // with shipping's in iOS 26 simulator captures, and that style's own gaussianBlur radius.
  private static let styles: [String: (style: UIBlurEffect.Style, radiusPt: CGFloat)] = [
    "light": (.light, 30),
    "dark": (.systemUltraThinMaterialDark, 22.5),
  ]

  // { radius, durationMs, easing: [x1, y1, x2, y2], theme }: blur to `radius` over the duration,
  // on the CSS cubic-bezier, in the style that suits the paper theme.
  @objc var blur: NSDictionary? {
    didSet { update() }
  }

  private let effectView = UIVisualEffectView(effect: nil)
  private var animator: UIViewPropertyAnimator?
  private var link: CADisplayLink?
  private var theme = "light"
  private var shownRadius: CGFloat = 0
  private var targetRadius: CGFloat = 0
  private var transition: Transition?

  private struct Transition {
    let from: CGFloat
    let to: CGFloat
    let duration: CFTimeInterval
    let curve: CubicBezier
    var start: CFTimeInterval?
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    effectView.frame = bounds
    effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(effectView)
    NotificationCenter.default.addObserver(
      self, selector: #selector(restoreEffect),
      name: UIApplication.willEnterForegroundNotification, object: nil)
  }

  required init?(coder: NSCoder) { nil }

  deinit {
    link?.invalidate()
    releaseAnimator()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      link?.invalidate()
      link = nil
      return
    }
    restoreEffect()
    if transition != nil { startTicking() }
  }

  private func update() {
    let nextTheme = blur?["theme"] as? String ?? "light"
    if nextTheme != theme {
      theme = nextTheme
      restoreEffect()
    }
    let radius = CGFloat((blur?["radius"] as? NSNumber)?.doubleValue ?? 0)
    guard radius != targetRadius else { return }
    targetRadius = radius
    let durationMs = (blur?["durationMs"] as? NSNumber)?.doubleValue ?? 0
    let points = (blur?["easing"] as? [NSNumber])?.map { CGFloat($0.doubleValue) } ?? []
    let curve = points.count == 4 ? CubicBezier(points) : CubicBezier.linear
    if durationMs <= 0 {
      transition = nil
      show(radius)
      return
    }
    transition = Transition(
      from: shownRadius, to: radius, duration: durationMs / 1000, curve: curve, start: nil)
    if window != nil { startTicking() }
  }

  private func startTicking() {
    guard link == nil else { return }
    let link = CADisplayLink(target: WeakTarget(self), selector: #selector(WeakTarget.tick(_:)))
    link.add(to: .main, forMode: .common)
    self.link = link
  }

  fileprivate func tick(_ link: CADisplayLink) {
    guard var running = transition else {
      link.invalidate()
      self.link = nil
      return
    }
    let start = running.start ?? link.timestamp
    running.start = start
    let progress = min(1, (link.timestamp - start) / running.duration)
    show(running.from + (running.to - running.from) * running.curve.value(at: progress))
    if progress >= 1 {
      transition = nil
      link.invalidate()
      self.link = nil
    } else {
      transition = running
    }
  }

  private var themed: (style: UIBlurEffect.Style, radiusPt: CGFloat) {
    Self.styles[theme] ?? Self.styles["light"]!
  }

  private func show(_ radius: CGFloat) {
    shownRadius = radius
    if radius <= 0 {
      releaseAnimator()
      effectView.effect = nil
      return
    }
    if animator == nil { makeAnimator() }
    animator?.fractionComplete = min(1, radius / themed.radiusPt)
  }

  private func makeAnimator() {
    effectView.effect = nil
    let style = themed.style
    let animator = UIViewPropertyAnimator(duration: 1, curve: .linear) { [weak self] in
      self?.effectView.effect = UIBlurEffect(style: style)
    }
    animator.pausesOnCompletion = true
    animator.pauseAnimation()
    self.animator = animator
  }

  // A paused animator can lose its place while the app is in the background, and one must be
  // stopped before it is released.
  @objc private func restoreEffect() {
    guard shownRadius > 0 else { return }
    releaseAnimator()
    show(shownRadius)
  }

  private func releaseAnimator() {
    guard let animator else { return }
    animator.stopAnimation(true)
    self.animator = nil
  }
}

// CADisplayLink retains its target; this keeps the view free to go when its modal closes.
private final class WeakTarget {
  weak var view: SplotchBackdropBlurView?
  init(_ view: SplotchBackdropBlurView) { self.view = view }
  @objc func tick(_ link: CADisplayLink) {
    guard let view else {
      link.invalidate()
      return
    }
    view.tick(link)
  }
}

// A CSS cubic-bezier() timing function: progress in, eased progress out.
private struct CubicBezier {
  static let linear = CubicBezier([0, 0, 1, 1])
  private static let solverSteps = 8
  private static let solverTolerance: CGFloat = 1e-5
  let x1: CGFloat, y1: CGFloat, x2: CGFloat, y2: CGFloat

  init(_ points: [CGFloat]) {
    x1 = points[0]
    y1 = points[1]
    x2 = points[2]
    y2 = points[3]
  }

  func value(at progress: Double) -> CGFloat {
    sample(y1, y2, at: parameter(for: CGFloat(progress)))
  }

  private func sample(_ a: CGFloat, _ b: CGFloat, at t: CGFloat) -> CGFloat {
    let inverse = 1 - t
    return 3 * inverse * inverse * t * a + 3 * inverse * t * t * b + t * t * t
  }

  private func slope(_ a: CGFloat, _ b: CGFloat, at t: CGFloat) -> CGFloat {
    let inverse = 1 - t
    return 3 * inverse * inverse * a + 6 * inverse * t * (b - a) + 3 * t * t * (1 - b)
  }

  // Newton's method on the curve's x, falling back to bisection where the slope flattens.
  private func parameter(for x: CGFloat) -> CGFloat {
    var t = x
    for _ in 0..<Self.solverSteps {
      let error = sample(x1, x2, at: t) - x
      if abs(error) < Self.solverTolerance { return t }
      let d = slope(x1, x2, at: t)
      if abs(d) < Self.solverTolerance { break }
      t -= error / d
    }
    var low: CGFloat = 0
    var high: CGFloat = 1
    t = x
    while high - low > Self.solverTolerance {
      if sample(x1, x2, at: t) < x { low = t } else { high = t }
      t = (low + high) / 2
    }
    return t
  }
}

@objc(SplotchBackdropBlurManager)
final class SplotchBackdropBlurManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { SplotchBackdropBlurView() }
}

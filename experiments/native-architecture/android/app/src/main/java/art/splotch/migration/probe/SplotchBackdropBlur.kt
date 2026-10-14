package art.splotch.migration.probe

import android.animation.ValueAnimator
import android.graphics.RenderEffect
import android.graphics.Shader
import android.os.Build
import android.view.View
import android.view.animation.LinearInterpolator
import android.view.animation.PathInterpolator
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.uimanager.annotations.ReactProp

// Skia's conversion of a blur radius to a Gaussian's standard deviation, which RenderEffect applies
// (hwui Blur::convertRadiusToSigma). A CSS blur() length is that standard deviation.
private const val BLUR_SIGMA_PER_RADIUS = 0.57735f
private const val BLUR_SIGMA_OFFSET = 0.5f

// The shipping dialog backdrop's blur (app.css .modal-dialog::backdrop): a CSS blur() of what lies
// behind the dialog, under the scrim's dim. A React Native Modal is a window of its own, and no
// view blurs another window's pixels, so this view, inside the modal, puts a RenderEffect on the
// window beneath it: the activity's, or the dialog's it was stacked over. It holds the effect only
// while its modal is attached. RenderEffect arrived in Android 12 (API 31); below it the view does
// nothing and the scrim keeps shipping's plain dim.
class SplotchBackdropBlurView(private val reactContext: ThemedReactContext) : View(reactContext) {
  private var target: View? = null
  private var targetRadiusDp = 0f
  private var shownRadiusDp = 0f
  private var pending: ValueAnimator? = null
  private var animator: ValueAnimator? = null

  // { radius, durationMs, easing: [x1, y1, x2, y2] }: blur to the CSS `radius` over the duration,
  // on the CSS cubic-bezier.
  fun setBlur(blur: ReadableMap?) {
    val radius = blur?.takeIf { it.hasKey("radius") }?.getDouble("radius")?.toFloat() ?: 0f
    if (radius == targetRadiusDp) return
    targetRadiusDp = radius
    val durationMs = blur?.takeIf { it.hasKey("durationMs") }?.getDouble("durationMs")?.toLong() ?: 0L
    val easing = blur?.takeIf { it.hasKey("easing") }?.getArray("easing")
    animator?.cancel()
    pending?.cancel()
    val transition = ValueAnimator.ofFloat(shownRadiusDp, radius).apply {
      duration = durationMs
      interpolator =
        if (easing != null && easing.size() == 4)
          PathInterpolator(
            easing.getDouble(0).toFloat(),
            easing.getDouble(1).toFloat(),
            easing.getDouble(2).toFloat(),
            easing.getDouble(3).toFloat(),
          )
        else LinearInterpolator()
      addUpdateListener { show(it.animatedValue as Float) }
    }
    if (isAttachedToWindow) start(transition) else pending = transition
  }

  private fun start(transition: ValueAnimator) {
    pending = null
    animator = transition
    transition.start()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    target = stacked.lastOrNull()?.rootView ?: reactContext.currentActivity?.window?.decorView
    stacked.add(this)
    // A modal's window can be rebuilt under a view that keeps its radius: blur the new one at once.
    pending?.let(::start) ?: show(targetRadiusDp)
  }

  override fun onDetachedFromWindow() {
    animator?.cancel()
    show(0f)
    stacked.remove(this)
    target = null
    super.onDetachedFromWindow()
  }

  private fun show(radiusDp: Float) {
    shownRadiusDp = radiusDp
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val sigmaPx = radiusDp * resources.displayMetrics.density
    val radiusPx = (sigmaPx - BLUR_SIGMA_OFFSET) / BLUR_SIGMA_PER_RADIUS
    target?.setRenderEffect(
      if (radiusPx > 0f) RenderEffect.createBlurEffect(radiusPx, radiusPx, Shader.TileMode.CLAMP)
      else null
    )
  }

  companion object {
    // The open modals' blur views, oldest first: each blurs the window of the one before it.
    private val stacked = mutableListOf<SplotchBackdropBlurView>()
  }
}

class SplotchBackdropBlurManager : SimpleViewManager<SplotchBackdropBlurView>() {
  override fun getName() = "SplotchBackdropBlur"

  override fun createViewInstance(context: ThemedReactContext) = SplotchBackdropBlurView(context)

  @ReactProp(name = "blur")
  fun setBlur(view: SplotchBackdropBlurView, blur: ReadableMap?) = view.setBlur(blur)
}

class SplotchBackdropBlurPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = emptyList()
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(SplotchBackdropBlurManager())
}

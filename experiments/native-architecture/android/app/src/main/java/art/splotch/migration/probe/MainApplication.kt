package art.splotch.migration.probe

import android.app.Application
import android.content.res.Configuration
import android.graphics.Typeface

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.common.assets.ReactFontManager
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(SplotchLibraryPackage())
          add(SplotchDeviceLockPackage())
          add(SplotchGateKeyboardPackage())
          add(SplotchAIEnvironmentPackage())
          add(SplotchPhotoLibraryPackage())
          add(SplotchClearSoundPackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    // React Native rounds a named family it cannot find to regular or bold, so `system-ui` at 600
    // drew regular; registered as the system typeface, the family takes each weight as asked, as
    // Chromium's system-ui does.
    ReactFontManager.getInstance().addCustomFont(SYSTEM_UI_FONT_FAMILY, Typeface.DEFAULT)
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}

// The CSS generic family the hub rows name (src/rsdDrawing/hubRowFace.native.ts);
// native-system-face.test.mjs reads both sides.
private const val SYSTEM_UI_FONT_FAMILY = "system-ui"

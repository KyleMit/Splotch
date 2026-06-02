# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Preserve line numbers for readable crash/ANR stack traces, but hide the
# original source file name. The generated mapping.txt (the deobfuscation file)
# is bundled into the AAB automatically and lets Play Console retrace traces.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# --- Capacitor ---------------------------------------------------------------
# Capacitor finds plugins and bridges JS<->native via reflection over annotated
# classes/methods, so R8 (full mode) must not rename or strip them.
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public <methods>;
}
# @JavascriptInterface methods are invoked by name from the WebView.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

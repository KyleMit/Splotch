#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(SplotchGateKeyboardManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(onGateKey, RCTDirectEventBlock)
@end

@interface RCT_EXTERN_MODULE(SplotchShortcutKeyboardManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(onShortcutKey, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(shortcutScope, NSString)
RCT_EXPORT_VIEW_PROPERTY(shortcutsEnabled, BOOL)
@end

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SplotchDeviceLock, NSObject)
RCT_EXTERN_METHOD(isLocked:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end

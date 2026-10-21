#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SplotchPaperReplay, NSObject)
RCT_EXTERN_METHOD(requestedTrace:(NSString *)launchKey resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(start:(NSString *)name packets:(NSString *)packets settleMs:(double)settleMs resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end

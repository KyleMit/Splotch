#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SplotchLibraryEnvironment, NSObject)
RCT_EXTERN_METHOD(environment:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(verify:(NSString *)uri bytes:(double)bytes sha256:(NSString *)sha256 resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(install:(NSString *)marker identity:(NSString *)identity allowMetered:(BOOL)allowMetered resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(cancelAll:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SplotchClearSound, NSObject)
RCT_EXTERN_METHOD(create:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(prepare:(NSString *)identifier uris:(NSArray<NSString *> *)uris resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(play:(NSString *)identifier index:(NSInteger)index volume:(double)volume resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(dispose:(NSString *)identifier)
@end

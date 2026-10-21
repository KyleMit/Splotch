#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SplotchPerfLog, NSObject)
RCT_EXTERN_METHOD(write:(NSString *)line)
@end

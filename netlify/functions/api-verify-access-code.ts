import { apiFunction } from '../../web/src/lib/server/api/apiFunction';
import { POST } from '../../web/src/lib/server/api/verifyAccessCode';

export default apiFunction({ POST });

export const config = { path: '/api/verify-access-code' };

import { apiFunction } from '../../web/src/lib/server/api/apiFunction';
import { GET, POST } from '../../web/src/lib/server/api/generationAttempt';

export default apiFunction({ GET, POST });

export const config = { path: '/api/generation-attempt/v1' };

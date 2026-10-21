import { apiFunction } from '../../web/src/lib/server/api/apiFunction';
import { GET } from '../../web/src/lib/server/api/generationResult';

export default apiFunction({ GET });

export const config = { path: '/api/generation-result' };

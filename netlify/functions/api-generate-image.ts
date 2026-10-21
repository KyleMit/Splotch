import { apiFunction } from '../../web/src/lib/server/api/apiFunction';
import { POST } from '../../web/src/lib/server/api/generateImage';

export default apiFunction({ POST });

export const config = { path: '/api/generate-image' };

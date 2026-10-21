import { apiFunction } from '../../web/src/lib/server/api/apiFunction';
import { DELETE, GET, POST } from '../../web/src/lib/server/api/adminTokens';

export default apiFunction({ GET, POST, DELETE });

export const config = { path: '/api/admin/tokens' };

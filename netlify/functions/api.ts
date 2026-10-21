import * as adminLogin from '../../web/src/lib/server/api/adminLogin';
import * as adminTokens from '../../web/src/lib/server/api/adminTokens';
import { apiFunction } from '../../web/src/lib/server/api/apiFunction';
import * as cspReport from '../../web/src/lib/server/api/cspReport';
import * as freeGenerationGrant from '../../web/src/lib/server/api/freeGenerationGrant';
import * as generateImage from '../../web/src/lib/server/api/generateImage';
import * as generationAttempt from '../../web/src/lib/server/api/generationAttempt';
import * as generationResult from '../../web/src/lib/server/api/generationResult';
import * as report from '../../web/src/lib/server/api/report';
import * as reportImage from '../../web/src/lib/server/api/reportImage';
import * as verifyAccessCode from '../../web/src/lib/server/api/verifyAccessCode';
import * as verifyKey from '../../web/src/lib/server/api/verifyKey';

// Every /api endpoint, in one function so they share one instance's rate-limit
// buckets as they did inside SvelteKit's (apiFunction.ts says why). Netlify reads
// `config` by static analysis, so its paths are literals; the wire-diff test
// fails if they and this table's keys disagree.
export default apiFunction({
  '/api/admin/login': adminLogin,
  '/api/admin/tokens': adminTokens,
  '/api/csp-report': cspReport,
  '/api/free-generation-grant': freeGenerationGrant,
  '/api/generate-image': generateImage,
  '/api/generation-attempt/v1': generationAttempt,
  '/api/generation-result': generationResult,
  '/api/report': report,
  '/api/report-image': reportImage,
  '/api/verify-access-code': verifyAccessCode,
  '/api/verify-key': verifyKey,
});

export const config = {
  path: [
    '/api/admin/login',
    '/api/admin/tokens',
    '/api/csp-report',
    '/api/free-generation-grant',
    '/api/generate-image',
    '/api/generation-attempt/v1',
    '/api/generation-result',
    '/api/report',
    '/api/report-image',
    '/api/verify-access-code',
    '/api/verify-key',
  ],
};

import { getStore as openStore, type GetStoreOptions } from '@netlify/blobs';
import { scopeStoreName } from './deploymentConfig.generated';
import { testStoreName, type BlobNamespace } from './blobNamespace';

// Published-deploy maintenance must reach branch stores because branch schedules do not run.
export function getStore(
  options: GetStoreOptions & { name: string },
  namespace: BlobNamespace = 'active'
) {
  return openStore({
    ...options,
    name: namespace === 'test' ? testStoreName(options.name) : scopeStoreName(options.name),
  });
}

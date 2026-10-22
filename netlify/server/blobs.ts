import { getStore as openStore, type GetStoreOptions } from '@netlify/blobs';
import { scopeStoreName } from './deploymentConfig.generated';

export function getStore(options: GetStoreOptions & { name: string }) {
  return openStore({ ...options, name: scopeStoreName(options.name) });
}

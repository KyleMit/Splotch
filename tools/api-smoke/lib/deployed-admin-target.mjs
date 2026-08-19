import { SITE_ORIGIN } from '../../../web/src/lib/siteUrl.ts';

export function shouldWriteBlobsProbe(targetUrl) {
  return new URL(targetUrl).origin !== SITE_ORIGIN;
}

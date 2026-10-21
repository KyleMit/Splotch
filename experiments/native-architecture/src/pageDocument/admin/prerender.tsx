import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { shippingFontFaceRules } from '../../platform/shippingFont.web';
import { createAdminApi } from './adminApi';
import { ADMIN_DOCUMENT_TITLE, type AdminTheme } from './adminContract';
import { createAdminSessionStore } from './adminSession';
import { AdminConsole } from './AdminConsole';

// The build bundles this module for Node (tools/migration/prerender-native-web-admin.mjs) and
// writes the admin document's markup from it, one variant per theme, in the state the entry
// (adminApp.tsx) hydrates: before the stored session is read. A render runs no effects, so
// nothing here is ever called.
const unreachable = () => Promise.reject(new Error('The build render makes no request.'));

export function renderAdminVariant(theme: AdminTheme) {
  return renderToString(
    <StrictMode>
      <AdminConsole
        theme={theme}
        api={createAdminApi(unreachable)}
        sessions={createAdminSessionStore(() => null)}
        confirm={() => false}
        writeClipboard={unreachable}
      />
    </StrictMode>
  );
}

export function adminDocumentHead() {
  return { title: ADMIN_DOCUMENT_TITLE, fontFaceRules: shippingFontFaceRules() };
}

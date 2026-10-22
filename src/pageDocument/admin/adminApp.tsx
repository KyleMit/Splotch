import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { createAdminApi } from './adminApi';
import { ADMIN_VARIANT_ATTRIBUTE, isAdminTheme } from './adminContract';
import { browserSessionStore } from './adminSession';
import { AdminConsole } from './AdminConsole';

// The admin document's own entry (tools/migration/prerender-native-web-admin.mjs): React DOM and
// the console alone, hydrating the theme variant the boot script kept as the root.
const root = document.getElementById('root');
const theme = root?.getAttribute(ADMIN_VARIANT_ATTRIBUTE) ?? null;
if (root && isAdminTheme(theme))
  hydrateRoot(
    root,
    <StrictMode>
      <AdminConsole
        theme={theme}
        api={createAdminApi((input, init) => fetch(input, init))}
        sessions={browserSessionStore}
        confirm={(message) => window.confirm(message)}
        writeClipboard={(text) => navigator.clipboard.writeText(text)}
      />
    </StrictMode>
  );

// The /admin console's form wire, declared once for both ends: +page.svelte
// posts to these actions with these fields, AdminConsole.svelte names its
// inputs with them, and +page.server.ts exports the actions and reads the
// fields. The page imports it, so it cannot live in a server-only module:
// neither $lib/server nor +page.server.ts.

/**
 * The /admin form actions, each posted as `?/<name>`. routes/admin/page.server.test.ts
 * pins +page.server.ts' `actions` keys to this list.
 */
export const ADMIN_ACTIONS = ['login', 'logout', 'add', 'remove'] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/** The /admin form field names, set by the console and read by the page's form actions. */
export const ADMIN_FORM_FIELDS = {
  accessKey: 'access-key',
  token: 'token',
} as const;

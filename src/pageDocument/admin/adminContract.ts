// What the admin document's build (tools/migration/prerender-native-web-admin.mjs) and its entry
// agree on.

// The localStorage key holding the bearer session POST /api/admin/login returns, so the owner signs
// in once per browser (issue 3007). Signing out, or any admin call answered 401, removes it.
export const ADMIN_SESSION_KEY = 'splotch-admin-session';

// The <html> attribute the boot script sets when a session is stored, so the prerendered sign-in
// form gives way to the loading line before the entry has run.
export const ADMIN_SESSION_ATTRIBUTE = 'data-admin-session';

// Marks what the prerendered page shows while the stored session is still unread: 'sign-in' for
// the form, 'loading' for the line that replaces it when the boot script found a session.
export const ADMIN_RESTORING_ATTRIBUTE = 'data-admin-restoring';

// The attribute naming each prerendered theme variant; the boot script keeps the one that fits as
// the root, and the entry hydrates it in that theme.
export const ADMIN_VARIANT_ATTRIBUTE = 'data-admin-theme';

export const ADMIN_THEMES = ['light', 'dark'] as const;
export type AdminTheme = (typeof ADMIN_THEMES)[number];

export function isAdminTheme(value: string | null): value is AdminTheme {
  return value === 'light' || value === 'dark';
}

export const ADMIN_DOCUMENT_TITLE = 'Admin Console · Splotch';

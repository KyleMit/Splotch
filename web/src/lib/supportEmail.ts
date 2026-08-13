// The one address a person can reach a human at: the beta sign-up pages' step
// 4, and the /feedback page's fallback when the issue tracker can't be reached.
// Declared once here rather than beside those pages so they can never offer
// different addresses.
//
// The address is split so the literal string appears nowhere in a prerendered
// document: the beta pages compose it after hydration, which keeps it out of
// reach of the harvesters that scrape static markup. A headless scraper can
// still reassemble it — this reduces exposure, it doesn't eliminate it.
const SUPPORT_MAILBOX = 'kylemit.dev';
const SUPPORT_DOMAIN = 'gmail.com';

/**
 * Safe to call on the server, but only where the result cannot reach a
 * crawlable document — /feedback renders it into an action's POST response,
 * which no crawler issues. Anywhere a GET could carry it, compose it after
 * hydration instead (see the beta routes).
 */
export function supportEmail(): string {
  return `${SUPPORT_MAILBOX}@${SUPPORT_DOMAIN}`;
}

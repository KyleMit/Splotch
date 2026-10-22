export { createIssue, isReportingConfigured } from './deployment.generated';

/**
 * Neutralize GitHub-flavoured Markdown in untrusted text before it is embedded
 * in an issue body. `/api/report` is unauthenticated, so a submitter must not be
 * able to make the issue notify people or embed remote content: we backslash-
 * escape the trigger characters (all ASCII-punctuation escapes GitHub honours),
 * which renders the literal text the user typed, minus the powers:
 *
 *  - `@name` / `@org/team` → no user or team mention (which would fire a notification)
 *  - `#123`               → no issue/PR back-reference (also a notification)
 *  - `![alt](url)`        → no image embed (plain `[text](url)` links are left intact)
 *  - `<img …>` / `<a …>`  → no raw HTML tags at all
 *
 * Backslashes are escaped first: otherwise a `\` the text already carries would
 * pair with the one added here into a literal backslash, leaving the `@`, `#`,
 * `![` or `<` after it live again.
 *
 * Applied to every issue-body string the server did not write: the report
 * message, every device value, and an AI report's refusal reason. Issue
 * *titles* need no escaping — GitHub renders them as plain text, so a mention
 * or ref there neither links nor notifies.
 */
export function escapeIssueMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/</g, '\\<')
    .replace(/@(?=[A-Za-z0-9_-])/g, '\\@')
    .replace(/#(?=\d)/g, '\\#')
    .replace(/!(?=\[)/g, '\\!');
}

export interface CreateIssueInput {
  title: string;
  body: string;
  labels: string[];
}

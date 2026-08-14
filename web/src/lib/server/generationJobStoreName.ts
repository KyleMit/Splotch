// Split out for the same reason imageReportStoreName.ts is: the Netlify function
// under netlify/ imports the name without pulling the server module (and its
// $lib/$env resolution) into a build that has neither.
export const GENERATION_JOB_STORE_NAME = 'ai-generation-jobs';

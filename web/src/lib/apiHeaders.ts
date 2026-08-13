export const ACCESS_TOKEN_HEADER = 'X-Access-Token';
export const API_KEY_HEADER = 'X-Api-Key';
export const INSTALLATION_ID_HEADER = 'X-Installation-Id';
export const FREE_GENERATIONS_REMAINING_HEADER = 'X-Free-Generations-Remaining';
// Minted when a free AI run returns an image or refusal, then spent by
// report-image — so it travels in both directions and belongs in the CORS allow
// *and* expose lists.
export const REPORT_TOKEN_HEADER = 'X-Report-Token';

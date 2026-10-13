// Everything AI and feedback the web export loads after first paint, as one chunk: the owners, the
// AI sheets that render them and the vault a launch invite writes. Feedback's form is a Settings
// section, which renders the owner it is handed and so loads with Settings. Expo moves every module two lazy
// chunks share into its common chunk, which index.html loads before first paint, so a second chunk
// for any of these would put the modules they share back on the startup path (ADR-0179).
export { createProductOwners } from './productOwners';
export { aiVault } from '../platform/ai';
export { RsdAiSheet } from '../rsdDrawing/RsdAiSheet';
export { AiWaitingPolaroid } from '../ai/AiWaitingPolaroid';

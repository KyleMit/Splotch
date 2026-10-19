// Everything AI and feedback the web export loads after first paint, as one chunk: the owners, the
// AI sheets that render them and the vault a launch invite writes. Feedback's form is a Settings
// section, which renders the owner it is handed and so loads with Settings. Granular chunking
// gives the modules two lazy chunks share a chunk of their own, so a second chunk for any of these
// would split what they share into more requests after first paint (ADR-0179).
export { createProductOwners } from './productOwners';
export { aiVault } from '../platform/ai';
export { RsdAiStylePrompt } from '../rsdDrawing/RsdAiStylePrompt';
export { RsdAiResult } from '../rsdDrawing/RsdAiResult';
export { AiWaitingPolaroid } from '../ai/AiWaitingPolaroid';

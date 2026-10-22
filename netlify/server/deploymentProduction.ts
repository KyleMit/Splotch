import { env } from './privateEnv';

export const projectApiKey = () => env.OPENAI_API_KEY;
export const scopeStoreName = (name: string) => name;

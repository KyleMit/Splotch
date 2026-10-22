// Netlify supplies the deployed function environment through process.env. The plain Node host
// reads no dotenv file and supplies only its caller's environment. Centralize private reads here.
export const env: Record<string, string | undefined> = process.env;

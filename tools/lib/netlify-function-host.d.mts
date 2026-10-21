// Declares only the exports TypeScript imports (web/netlifyFunctionsHost.ts); tools/ itself is untyped.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NetlifyContext } from '../../web/src/lib/server/api/apiFunction';

export type NetlifyFunction = (request: Request, context: NetlifyContext) => Promise<Response>;

export function functionFiles(): (pathname: string) => string | null;

export function loadNetlifyFunctions(mode: 'development' | 'production'): Promise<{
  functionFor: (pathname: string) => NetlifyFunction | null;
  close: () => Promise<void>;
}>;

export function invokeFunction(handler: NetlifyFunction, req: IncomingMessage): Promise<Response>;

export function writeResponse(res: ServerResponse, response: Response): Promise<void>;

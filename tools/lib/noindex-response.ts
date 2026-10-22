export function noindexResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default async function noindex(
  _request: Request,
  context: { next(): Promise<Response> }
): Promise<Response> {
  return noindexResponse(await context.next());
}

export const config = { path: '/*' };

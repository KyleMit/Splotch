export type AiImageResponse =
  | { kind: 'image'; blob: Blob }
  | { kind: 'safety' }
  | { kind: 'throttled'; retryAfter: string | null; detail: string }
  | { kind: 'error'; status: number; detail: string };

const SAFETY_REFUSAL_STATUS = 422;
const THROTTLED_STATUS = 429;

async function readErrorDetail(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

export async function readAiImageResponse(response: Response): Promise<AiImageResponse> {
  if (response.ok) return { kind: 'image', blob: await response.blob() };

  const detail = await readErrorDetail(response);
  if (response.status === SAFETY_REFUSAL_STATUS) return { kind: 'safety' };
  if (response.status === THROTTLED_STATUS) {
    return {
      kind: 'throttled',
      retryAfter: response.headers.get('Retry-After'),
      detail,
    };
  }
  return { kind: 'error', status: response.status, detail };
}

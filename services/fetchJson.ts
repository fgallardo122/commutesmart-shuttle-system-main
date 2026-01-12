export class HttpError extends Error {
  status: number;
  bodyText: string;

  constructor(message: string, status: number, bodyText: string) {
    super(message);
    this.status = status;
    this.bodyText = bodyText;
  }
}

export const fetchJson = async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
  const res = await fetch(input, init);
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.toLowerCase().includes('application/json');

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const message = text ? `${res.status} ${res.statusText}: ${text}` : `${res.status} ${res.statusText}`;
    throw new HttpError(message, res.status, text);
  }

  if (!isJson) {
    const text = await res.text().catch(() => '');
    throw new HttpError('Non-JSON response', res.status, text);
  }

  return (await res.json()) as T;
};

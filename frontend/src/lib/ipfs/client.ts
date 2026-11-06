import { toArrayBuffer } from '../crypto/bytes';

const API_ROOT = 'http://127.0.0.1:5001/api/v0';

async function request(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      ...init,
    });
  } catch (error) {
    throw new Error(`Local IPFS is unavailable at ${API_ROOT}. Start it with npm run ipfs:start.`, {
      cause: error,
    });
  }
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(
      `Kubo rejected the request (${response.status}): ${detail || response.statusText}`,
    );
  }
  return response;
}

export async function addBytes(
  bytes: Uint8Array,
  filename = 'encrypted-medical-record.mch',
): Promise<{ cid: string; size: number }> {
  const body = new FormData();
  body.append(
    'file',
    new Blob([toArrayBuffer(bytes)], { type: 'application/octet-stream' }),
    filename,
  );
  const response = await request('/add?cid-version=1&raw-leaves=true&pin=true', { body });
  const entries = (await response.text())
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { Hash?: string; Size?: string });
  const result = entries.at(-1);
  if (!result?.Hash || result.Size === undefined) {
    throw new Error('Kubo returned an invalid add response.');
  }
  return { cid: result.Hash, size: Number(result.Size) };
}

export async function catBytes(cid: string): Promise<Uint8Array> {
  if (!cid.trim()) throw new Error('A nonempty IPFS CID is required.');
  const response = await request(`/cat?arg=${encodeURIComponent(cid)}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function getIpfsVersion(): Promise<string> {
  const response = await request('/version');
  const body = (await response.json()) as { Version?: string };
  if (!body.Version) throw new Error('Kubo version response is missing Version.');
  return body.Version;
}

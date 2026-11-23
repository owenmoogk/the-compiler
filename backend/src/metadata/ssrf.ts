import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress } from 'node:dns';
import type { LookupFunction } from 'node:net';

import ipaddr from 'ipaddr.js';
import { Agent, fetch as undiciFetch } from 'undici';

/**
 * The scraper runs on a home network, so it must never be talked into fetching
 * a LAN or loopback address. Every hostname is resolved and checked at connect
 * time (so DNS rebinding cannot swap the address after the check), and IP
 * literals and redirect targets are checked before each request.
 */
export class BlockedUrlError extends Error {}

export function isPublicAddress(address: string) {
  if (!ipaddr.isValid(address)) return false;
  return ipaddr.process(address).range() === 'unicast';
}

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home.arpa',
];

export function assertPublicUrl(raw: string | URL) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('Only http(s) URLs can be fetched');
  }
  if (url.username || url.password) {
    throw new BlockedUrlError('URLs with credentials cannot be fetched');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (ipaddr.isValid(host)) {
    if (!isPublicAddress(host)) {
      throw new BlockedUrlError(`Refusing to fetch private address ${host}`);
    }
  } else if (
    host === 'localhost' ||
    !host.includes('.') ||
    BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    throw new BlockedUrlError(`Refusing to fetch local host ${host}`);
  }
  return url;
}

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '', 0);
      return;
    }
    const list: LookupAddress[] = addresses;
    const blocked = list.find((entry) => !isPublicAddress(entry.address));
    if (blocked || !list.length) {
      callback(
        new BlockedUrlError(
          `Refusing to connect to ${hostname} (${blocked?.address ?? 'no address'})`
        ),
        '',
        0
      );
      return;
    }
    if (options.all) {
      callback(null, list);
    } else {
      const first = list[0];
      callback(null, first.address, first.family);
    }
  });
};

const agent = new Agent({
  connect: { lookup: guardedLookup, timeout: 8_000 },
  headersTimeout: 10_000,
  bodyTimeout: 10_000,
});

export const USER_AGENT =
  'Mozilla/5.0 (compatible; TheCompiler/2.0; +https://owenmoogk.com/the-compiler/)';

export type FetchedPage = {
  url: string;
  status: number;
  contentType: string;
  body: string;
};

/** GET/HEAD a public URL with redirects re-checked, a timeout and a size cap. */
export async function safeFetch(
  raw: string,
  {
    method = 'GET',
    accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
    maxBytes = 2 * 1024 * 1024,
  }: { method?: 'GET' | 'HEAD'; accept?: string; maxBytes?: number } = {}
) {
  let current = assertPublicUrl(raw);
  const deadline = AbortSignal.timeout(12_000);

  for (let hop = 0; hop <= 5; hop++) {
    const res = await undiciFetch(current, {
      method,
      redirect: 'manual',
      dispatcher: agent,
      signal: deadline,
      headers: {
        'user-agent': USER_AGENT,
        accept,
        'accept-language': 'en-US,en;q=0.8',
      },
    });

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      current = assertPublicUrl(new URL(location, current));
      continue;
    }

    const contentType = res.headers.get('content-type') ?? '';
    let body = '';
    if (method === 'GET' && res.body) {
      const chunks: Uint8Array[] = [];
      let size = 0;
      // Breaking out of the loop cancels the rest of the download.
      for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
        size += chunk.byteLength;
        if (size >= maxBytes) break;
      }
      const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8';
      const bytes = Buffer.concat(chunks);
      try {
        body = new TextDecoder(charset).decode(bytes);
      } catch {
        body = new TextDecoder('utf-8').decode(bytes);
      }
    } else {
      await res.body?.cancel();
    }

    return { url: current.toString(), status: res.status, contentType, body };
  }
  throw new Error('Too many redirects');
}

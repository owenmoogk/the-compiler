import { z } from 'zod';

import { safeFetch } from './ssrf';

export type OembedProvider = {
  name: string;
  match: RegExp;
  endpoint: string;
  /** Known-good icon, used when the page itself cannot be scraped. */
  favicon: string;
};

/** oEmbed avoids consent walls and bot checks on sites that have them. */
const PROVIDERS: OembedProvider[] = [
  {
    name: 'YouTube',
    match: /(^|\.)(youtube\.com|youtu\.be)$/,
    endpoint: 'https://www.youtube.com/oembed?format=json',
    favicon: 'https://www.youtube.com/favicon.ico',
  },
  {
    name: 'Vimeo',
    match: /(^|\.)vimeo\.com$/,
    endpoint: 'https://vimeo.com/api/oembed.json',
    favicon: 'https://vimeo.com/favicon.ico',
  },
  {
    name: 'Spotify',
    match: /(^|\.)open\.spotify\.com$/,
    endpoint: 'https://open.spotify.com/oembed',
    favicon: 'https://open.spotify.com/favicon.ico',
  },
  {
    name: 'SoundCloud',
    match: /(^|\.)soundcloud\.com$/,
    endpoint: 'https://soundcloud.com/oembed?format=json',
    favicon: 'https://soundcloud.com/favicon.ico',
  },
  {
    name: 'X',
    match: /(^|\.)(twitter\.com|x\.com)$/,
    endpoint: 'https://publish.twitter.com/oembed',
    favicon: 'https://abs.twimg.com/favicons/twitter.3.ico',
  },
  {
    name: 'Reddit',
    match: /(^|\.)reddit\.com$/,
    endpoint: 'https://www.reddit.com/oembed',
    favicon: 'https://www.reddit.com/favicon.ico',
  },
];

export function findProvider(url: string): OembedProvider | undefined {
  const host = new URL(url).hostname.toLowerCase();
  return PROVIDERS.find((provider) => provider.match.test(host));
}

const oembedSchema = z.object({
  title: z.string().optional(),
  author_name: z.string().optional(),
  provider_name: z.string().optional(),
  thumbnail_url: z.string().optional(),
});

export async function fetchOembed(provider: OembedProvider, url: string) {
  const endpoint = new URL(provider.endpoint);
  endpoint.searchParams.set('url', url);
  const res = await safeFetch(endpoint.toString(), {
    accept: 'application/json',
    maxBytes: 256 * 1024,
  });
  if (res.status !== 200) {
    throw new Error(`${provider.name} oEmbed returned ${res.status}`);
  }
  const data = oembedSchema.parse(JSON.parse(res.body));
  return {
    title: data.title,
    author: data.author_name,
    siteName: data.provider_name ?? provider.name,
    image: data.thumbnail_url,
  };
}

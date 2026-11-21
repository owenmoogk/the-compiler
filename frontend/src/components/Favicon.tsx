import { hostnameOf } from '@compiler/shared';
import { useState } from 'react';
import { FaGlobe } from 'react-icons/fa';

/** The stored favicon, then a favicon service, then a globe. */
export default function Favicon({
  url,
  favicon,
  size = 16,
}: {
  url: string;
  favicon?: string;
  size?: number;
}) {
  const sources = [
    favicon,
    `https://icons.duckduckgo.com/ip3/${hostnameOf(url)}.ico`,
  ].filter((src): src is string => Boolean(src));
  const key = sources.join('|');
  const [failed, setFailed] = useState<{ key: string; count: number }>({
    key,
    count: 0,
  });
  // Reset when the URL/favicon changes.
  const count = failed.key === key ? failed.count : 0;
  const src = sources[count];

  if (!src) {
    return <FaGlobe size={size} style={{ flexShrink: 0, opacity: 0.6 }} />;
  }
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      style={{ flexShrink: 0, objectFit: 'contain', borderRadius: 3 }}
      onError={() => setFailed({ key, count: count + 1 })}
    />
  );
}

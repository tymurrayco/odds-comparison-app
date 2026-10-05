// src/app/sitemap.ts — served at /sitemap.xml
//
// Static pages only for now. Per-sport and per-game odds URLs get added here
// once those pages render server-side (monetization plan step 1); /game/[id]
// and /futures/[sport] are share-preview shells that redirect to the board,
// so they are deliberately left out.
import type { MetadataRoute } from 'next';

const BASE = 'https://www.odds.day';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`,                 lastModified: now, changeFrequency: 'hourly',  priority: 1.0 },
    { url: `${BASE}/nfl`,              lastModified: now, changeFrequency: 'daily',   priority: 0.8 },
    { url: `${BASE}/fbs`,              lastModified: now, changeFrequency: 'daily',   priority: 0.8 },
    { url: `${BASE}/fcs`,              lastModified: now, changeFrequency: 'daily',   priority: 0.6 },
    { url: `${BASE}/ratings`,          lastModified: now, changeFrequency: 'daily',   priority: 0.6 },
    { url: `${BASE}/lacrosse-ratings`, lastModified: now, changeFrequency: 'weekly',  priority: 0.3 },
    { url: `${BASE}/terms`,            lastModified: now, changeFrequency: 'yearly',  priority: 0.1 },
    { url: `${BASE}/privacy`,          lastModified: now, changeFrequency: 'yearly',  priority: 0.1 },
  ];
}

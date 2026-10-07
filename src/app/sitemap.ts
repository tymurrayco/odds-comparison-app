// src/app/sitemap.ts — served at /sitemap.xml
//
// Static pages plus the server-rendered sport odds pages (/nfl, /nba, ...).
// Per-game URLs join once /game/[id] renders real content (it is still a
// share-preview shell that redirects to the board), as do /futures/[sport]
// and /bet/[id] for the same reason.
import type { MetadataRoute } from 'next';
import { SPORT_PAGES } from '@/lib/sportSlugs';

const BASE = 'https://www.odds.day';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const sportPages: MetadataRoute.Sitemap = SPORT_PAGES.map((s) => ({
    url: `${BASE}/${s.slug}`,
    lastModified: now,
    changeFrequency: 'hourly',
    priority: 0.9,
  }));
  return [
    { url: `${BASE}/`,                 lastModified: now, changeFrequency: 'hourly',  priority: 1.0 },
    ...sportPages,
    { url: `${BASE}/nfl/ratings`,      lastModified: now, changeFrequency: 'daily',   priority: 0.7 },
    { url: `${BASE}/fbs`,              lastModified: now, changeFrequency: 'daily',   priority: 0.7 },
    { url: `${BASE}/fcs`,              lastModified: now, changeFrequency: 'daily',   priority: 0.6 },
    { url: `${BASE}/ratings`,          lastModified: now, changeFrequency: 'daily',   priority: 0.6 },
    { url: `${BASE}/lacrosse-ratings`, lastModified: now, changeFrequency: 'weekly',  priority: 0.3 },
    { url: `${BASE}/terms`,            lastModified: now, changeFrequency: 'yearly',  priority: 0.1 },
    { url: `${BASE}/privacy`,          lastModified: now, changeFrequency: 'yearly',  priority: 0.1 },
  ];
}

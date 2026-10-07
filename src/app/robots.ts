// src/app/robots.ts — served at /robots.txt
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',     // admin tools
          '/api/',      // JSON endpoints — nothing to index, and some burn API credits
          '/go/',       // sportsbook click-out redirects
          '/login',     // admin login
          '/*?admin=',  // admin flag on public pages
        ],
      },
    ],
    sitemap: 'https://www.odds.day/sitemap.xml',
  };
}

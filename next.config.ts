// next.config.js (rename if needed)
/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: never add ODDS_API_KEY (or any secret) to an `env:` block here —
  // Next inlines `env` values into the client bundle. Server routes read
  // process.env natively.
  serverExternalPackages: ['puppeteer-extra', 'puppeteer-extra-plugin-stealth'],
};

module.exports = nextConfig;

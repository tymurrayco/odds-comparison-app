// next.config.js (rename if needed)
/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    ODDS_API_KEY: process.env.ODDS_API_KEY,
  },
  serverExternalPackages: ['puppeteer-extra', 'puppeteer-extra-plugin-stealth'],
};

module.exports = nextConfig;
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // No client-side router caching of dynamic pages. This is a live clinical
    // board: navigating back must never replay a stale snapshot (zombie
    // approval items, a bed page rendered before its draft existed). Every
    // navigation re-fetches the server render.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;

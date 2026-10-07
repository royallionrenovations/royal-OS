/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Royal AI briefings and lead runs can take a little while, so give the
  // serverless functions room. Vercel's free tier allows up to 60 seconds.
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb'
    }
  }
};

export default nextConfig;

// Dev-only: proxy /api/* to the local SME backend (localhost:4000) so the
// Expo Go app on a physical phone can reach the API through the Expo tunnel.
// The app's API base URL should be the tunnel URL itself, e.g.
// https://<subdomain>.exp.direct  ->  /api/events proxied to the backend.
const { getDefaultConfig } = require('expo/metro-config');
const http = require('http');

const config = getDefaultConfig(__dirname);

const API_HOST = process.env.SME_API_HOST || 'localhost';
const API_PORT = parseInt(process.env.SME_API_PORT || '4000', 10);

// Dev-only: also proxy /site/* to the Next.js public website (localhost:3000,
// served with basePath '/site') so a phone can browse the website through the
// Expo tunnel at https://<subdomain>.exp.direct/site
const SITE_HOST = process.env.SME_SITE_HOST || 'localhost';
const SITE_PORT = parseInt(process.env.SME_SITE_PORT || '3000', 10);

function proxyTo(host, port, req, res) {
  const proxyReq = http.request(
    {
      host,
      port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `${host}:${port}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', () => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'backend unreachable' }));
  });
  req.pipe(proxyReq);
}

config.server = {
  ...(config.server || {}),
  enhanceMiddleware: (middleware) => (req, res, next) => {
    if (req.url && req.url.startsWith('/site')) {
      proxyTo(SITE_HOST, SITE_PORT, req, res);
      return;
    }
    if (req.url && req.url.startsWith('/api/')) {
      proxyTo(API_HOST, API_PORT, req, res);
      return;
    }
    return middleware(req, res, next);
  },
};

module.exports = config;

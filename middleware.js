// Vercel Edge Middleware — shared-key gate for the data/write API routes.
// Runs OUTSIDE the 12-function limit and NEVER matches /api/webhook/* :
// the DIIO webhook keeps its own HMAC signature validation untouched.
// If APP_ACCESS_KEY is not configured, everything passes (no lockout).
export const config = {
  matcher: [
    '/api/projects',
    '/api/project-metrics',
    '/api/active-projects',
    '/api/manual-assign',
    '/api/webhook-logs',
    '/api/asana/:path*',
  ],
};

export default function middleware(req) {
  const key = process.env.APP_ACCESS_KEY;
  if (!key) return; // gate not configured yet — allow

  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)ob_key=([^;]+)/);
  if (match && decodeURIComponent(match[1]) === key) return; // authorized

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Vercel Serverless Function: Check Current Authenticated Session
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const cookies = req.headers.cookie || '';
  const match = cookies.match(/gcb_session=([^;]+)/);

  if (match) {
    try {
      const decoded = Buffer.from(match[1], 'base64').toString('utf8');
      const user = JSON.parse(decoded);
      if (user && user.authenticated && user.email) {
        // Return public user profile (strip internal token)
        const { access_token, ...safeUser } = user;
        return res.status(200).json(safeUser);
      }
    } catch (e) {
      console.error('[Session Cookie Parse Error]:', e);
    }
  }

  return res.status(200).json({
    authenticated: false,
    email: null,
    name: null,
    role: null
  });
}

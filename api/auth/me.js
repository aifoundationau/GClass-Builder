// Vercel Serverless Function: Check Current Authenticated Session

// The sign-in's Google ID token (valid an hour) is handed to the browser for this long, so the app
// can sign the same account in to Firebase (roles and tokens) without a second Google window
const FIREBASE_ID_TOKEN_MS = 50 * 60 * 1000;

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
        // Return public user profile (strip internal tokens)
        const { access_token, id_token, ...safeUser } = user;
        const fresh = Boolean(id_token) && Date.now() - Date.parse(user.login_time || '') < FIREBASE_ID_TOKEN_MS;
        return res.status(200).json(fresh ? { ...safeUser, firebase_id_token: id_token } : safeUser);
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

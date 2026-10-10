// Vercel Serverless Function: Google OAuth Login
export default async function handler(req, res) {
  let clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const credsPath = path.join(process.cwd(), 'credentials.json');
      if (fs.existsSync(credsPath)) {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        const web = creds.web || creds.installed || {};
        clientId = web.client_id;
      }
    } catch (e) {
      // Fallback if credentials file not on disk
    }
  }

  if (!clientId) {
    res.writeHead(302, { Location: `/?login_error=${encodeURIComponent('GOOGLE_CLIENT_ID is not configured')}` });
    return res.end();
  }
  
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  
  // Canonical redirect URI prevents Error 400: redirect_uri_mismatch on ephemeral preview URLs
  let redirectUri;
  if (process.env.GOOGLE_REDIRECT_URI) {
    redirectUri = process.env.GOOGLE_REDIRECT_URI;
  } else if (host.includes('localhost')) {
    redirectUri = `http://localhost:5173/api/auth/oauth2callback`;
  } else if (host.includes('.vercel.app')) {
    redirectUri = `https://g-class-builder.vercel.app/api/auth/oauth2callback`;
  } else {
    redirectUri = `${proto}://${host}/api/auth/oauth2callback`;
  }

  const scopes = [
    'https://www.googleapis.com/auth/classroom.courses',
    'https://www.googleapis.com/auth/classroom.topics',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.courseworkmaterials',
    'https://www.googleapis.com/auth/classroom.announcements',
    'https://www.googleapis.com/auth/classroom.rosters.readonly',
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ].join(' ');

  // Pass originating host in state so callback redirects user back to their active preview deployment
  const statePayload = Buffer.from(JSON.stringify({ returnTo: `${proto}://${host}` })).toString('base64');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'select_account consent');
  authUrl.searchParams.set('state', statePayload);

  res.writeHead(302, { Location: authUrl.toString() });
  res.end();
}

// Vercel Serverless Function: Google OAuth Callback
export default async function handler(req, res) {
  const { code, error } = req.query || {};

  if (error) {
    res.writeHead(302, { Location: `/?login_error=${encodeURIComponent('Google sign-in was cancelled or permission denied.')}` });
    return res.end();
  }

  if (!code) {
    res.writeHead(302, { Location: `/?login_error=${encodeURIComponent('No authorization code received from Google.')}` });
    return res.end();
  }

  let clientId = process.env.GOOGLE_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const credsPath = path.join(process.cwd(), 'credentials.json');
      if (fs.existsSync(credsPath)) {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        const web = creds.web || creds.installed || {};
        clientId = clientId || web.client_id;
        clientSecret = clientSecret || web.client_secret;
      }
    } catch (e) {
      // Fallback
    }
  }

  if (!clientId || !clientSecret) {
    res.writeHead(302, { Location: `/?login_error=${encodeURIComponent('Google OAuth credentials not configured on server.')}` });
    return res.end();
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = `${proto}://${host}/api/auth/oauth2callback`;

  try {
    // 1. Exchange code for Google OAuth tokens
    const tokenParams = new URLSearchParams({
      code: String(code),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[OAuth Token Exchange Error]:', tokenData);
      const errMsg = tokenData.error_description || tokenData.error || 'Failed to exchange authorization code.';
      res.writeHead(302, { Location: `/?login_error=${encodeURIComponent(errMsg)}` });
      return res.end();
    }

    // 2. Query Google UserInfo API for verified identity
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    if (!userRes.ok) {
      res.writeHead(302, { Location: `/?login_error=${encodeURIComponent('Failed to retrieve user profile from Google.')}` });
      return res.end();
    }

    const userInfo = await userRes.json();
    const email = userInfo.email || '';
    const name = userInfo.name || (email ? email.split('@')[0] : 'Instructor');
    const avatar = userInfo.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(email)}&backgroundColor=4285f4`;

    const userSession = {
      authenticated: true,
      email: email,
      name: name,
      role: 'Google Classroom Instructor / Teacher',
      avatar: avatar,
      domain: email.includes('@') ? email.split('@')[1] : '',
      access_token: tokenData.access_token,
      login_time: new Date().toISOString()
    };

    // 3. Serialize user session into secure cookie
    const sessionCookie = Buffer.from(JSON.stringify(userSession)).toString('base64');
    res.setHeader('Set-Cookie', `gcb_session=${sessionCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
    res.writeHead(302, { Location: '/?auth_success=1' });
    res.end();
  } catch (err) {
    console.error('[OAuth Callback Exception]:', err);
    res.writeHead(302, { Location: `/?login_error=${encodeURIComponent(err.message || 'Unknown authentication error')}` });
    res.end();
  }
}

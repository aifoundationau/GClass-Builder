// Vercel Serverless Function: Logout & Destroy Session
export default function handler(req, res) {
  res.setHeader('Set-Cookie', 'gcb_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax');
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ success: true, authenticated: false });
}

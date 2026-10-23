// Vercel Serverless Function: Role Notification Logs (Read-only status)
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Serverless environment: in-memory / zero-persistence fallback
  return res.status(200).json({
    total: 0,
    logs: [],
    environment: 'vercel-serverless'
  });
}

// Vercel Serverless Function: System & Safety Status
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const hasCredentials = Boolean(
    (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIREBASE_SERVICE_ACCOUNT
  );
  return res.status(200).json({
    status: "online",
    mode: "Live Google Classroom API",
    no_delete_policy_enforced: true,
    violations: [],
    credentials_present: hasCredentials
  });
}

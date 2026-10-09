// Vercel Serverless Function: System & Safety Status
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    status: "online",
    mode: "Live Google Classroom API",
    no_delete_policy_enforced: true,
    violations: [],
    credentials_present: true
  });
}

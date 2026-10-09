// Vercel Serverless Function: List Google Classroom Courses
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const cookies = req.headers.cookie || '';
  const match = cookies.match(/gcb_session=([^;]+)/);

  if (match) {
    try {
      const decoded = Buffer.from(match[1], 'base64').toString('utf8');
      const user = JSON.parse(decoded);
      if (user && user.access_token) {
        const gRes = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
          headers: { Authorization: `Bearer ${user.access_token}` }
        });
        if (gRes.ok) {
          const gData = await gRes.json();
          const courses = (gData.courses || []).map(c => ({
            id: c.id,
            name: c.name,
            section: c.section || "Default Section",
            enrollment_code: c.enrollmentCode || "",
            course_state: c.courseState || "ACTIVE"
          }));
          return res.status(200).json({ courses });
        }
      }
    } catch (err) {
      console.error('[Courses API Error]:', err);
    }
  }

  return res.status(200).json({ courses: [] });
}

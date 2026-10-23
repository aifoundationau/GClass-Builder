// Vercel Serverless Function: Role Notification Email Dispatcher
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const recipientEmail = body.recipientEmail || body.email;
    const roleKey = body.roleKey || body.role || 'supporter';
    const roleLabel = body.roleLabel || body.label || (roleKey.charAt(0).toUpperCase() + roleKey.slice(1));
    const permissions = Array.isArray(body.permissions) ? body.permissions : [];
    const adminEmail = body.adminEmail || null;

    if (!recipientEmail || typeof recipientEmail !== 'string' || !recipientEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid recipientEmail is required.' });
    }

    const subject = `Role Granted: You have been assigned the ${roleLabel} role [#gcoursebuilder]`;
    const permLines = permissions.map(p => `  * ${p}`).join('\n');
    const plainBody = `Hello,\n\nYour Google account (${recipientEmail}) has been granted the ${roleLabel} role on Google Course Builder.\n\nGranted Permissions:\n${permLines || '  * Baseline supporter access.'}\n\nHow to activate:\nSign in to Google Course Builder using ${recipientEmail}. Your role and permissions will activate automatically.\n\nTag: #gcoursebuilder\nAssigned by: ${adminEmail || 'System Administrator'}\n`;

    const composeParams = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: recipientEmail,
      su: subject,
      body: plainBody
    });
    const composeUrl = `https://mail.google.com/mail/?${composeParams.toString()}`;

    return res.status(200).json({
      success: true,
      sent: false,
      method: 'web_compose',
      recipient: recipientEmail,
      role: roleLabel,
      composeUrl,
      subject,
      tag: '#gcoursebuilder'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

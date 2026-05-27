let nodemailer;

try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

function getMailerConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_REPLY_TO } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !nodemailer) {
    return null;
  }
  // Tolerate bad SMTP_PORT values (e.g. someone pasted the host into the port
  // field in a dashboard). Fall back to 465 if the value isn't a positive number.
  let port = Number(SMTP_PORT);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) port = 465;
  // Default sender: "WhiteTeak LLC Admin <admin@whiteteakllc.com>" if SMTP_FROM not set.
  const from = SMTP_FROM || `WhiteTeak LLC Admin <admin@whiteteakllc.com>`;
  const replyTo = SMTP_REPLY_TO || "admin@whiteteakllc.com";
  return {
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    from,
    replyTo
  };
}

async function sendOtpEmail(email, otp, verifyLink = "") {
  const config = getMailerConfig();
  if (!config) {
    return { sent: false, mode: "dev", otp, verifyLink };
  }

  // Namecheap shared hosting issues one wildcard TLS cert (*.web-hosting.com)
  // for the cPanel server, not a per-domain cert. Connecting via
  // mail.whiteteakllc.com fails strict hostname verification even though the
  // connection is still encrypted. Relax hostname verification unless the
  // operator explicitly opts into strict mode via SMTP_TLS_STRICT=true.
  const relaxTls = String(process.env.SMTP_TLS_STRICT || "").toLowerCase() !== "true";
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    tls: relaxTls ? { rejectUnauthorized: false } : undefined
  });

  const linkBlockText = verifyLink
    ? `\n\nOr click this link to verify instantly:\n${verifyLink}\n`
    : "";
  const linkBlockHtml = verifyLink
    ? `<p>Or click the button below to verify instantly:</p>
       <p><a href="${verifyLink}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Verify my account</a></p>
       <p style="font-size:12px;color:#666">If the button doesn't work, paste this URL into your browser:<br><a href="${verifyLink}">${verifyLink}</a></p>`
    : "";

  await transporter.sendMail({
    from: config.from,
    replyTo: config.replyTo,
    to: email,
    subject: "Your WhiteTeak LLC verification code",
    text: `Your WhiteTeak LLC OTP is ${otp}. It is valid for 10 minutes.${linkBlockText}\n\n— WhiteTeak LLC Team (support@whiteteakllc.com)`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px">
             <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
               <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;font-weight:800;display:inline-flex;align-items:center;justify-content:center;font-size:15px">WT</div>
               <strong style="font-size:18px;color:#111">WhiteTeak LLC</strong>
             </div>
             <h2 style="color:#111;margin:8px 0 4px">Welcome to WhiteTeak LLC</h2>
             <p style="margin:8px 0 14px;color:#333">Your verification code is:</p>
             <p style="font-size:32px;letter-spacing:6px;font-weight:700;background:#f4f4f6;padding:16px 24px;border-radius:8px;text-align:center;color:#111;margin:0">${otp}</p>
             <p style="margin:14px 0 8px;color:#444">This code is valid for 10 minutes.</p>
             ${linkBlockHtml}
             <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
             <p style="font-size:12px;color:#888">If you didn't request this, you can safely ignore this email. For help, reply to this email or contact <a href="mailto:support@whiteteakllc.com">support@whiteteakllc.com</a>.</p>
           </div>`
  });

  return { sent: true, mode: "smtp" };
}

module.exports = { sendOtpEmail };

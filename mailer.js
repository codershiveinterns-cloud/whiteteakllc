let nodemailer;

try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

function getMailerConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM || !nodemailer) {
    return null;
  }
  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    from: SMTP_FROM
  };
}

async function sendOtpEmail(email, otp) {
  const config = getMailerConfig();
  if (!config) {
    return { sent: false, mode: "dev" };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth
  });

  await transporter.sendMail({
    from: config.from,
    to: email,
    subject: "Your ElectroHub OTP code",
    text: `Your ElectroHub OTP is ${otp}. It is valid for 10 minutes.`,
    html: `<p>Your ElectroHub OTP is <strong>${otp}</strong>.</p><p>It is valid for 10 minutes.</p>`
  });

  return { sent: true, mode: "smtp" };
}

module.exports = { sendOtpEmail };

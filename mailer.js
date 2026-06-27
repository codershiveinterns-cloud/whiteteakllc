let nodemailer;

try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getMailerConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_REPLY_TO } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !nodemailer) {
    return null;
  }

  let port = Number(SMTP_PORT);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) port = 465;

  return {
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    from: SMTP_FROM || "WhiteTeak LLC Admin <admin@whiteteakllc.com>",
    replyTo: SMTP_REPLY_TO || "admin@whiteteakllc.com"
  };
}

function formatMailerError(error) {
  if (!error) return null;
  return {
    message: error.message || "SMTP delivery failed",
    code: error.code || null,
    command: error.command || null,
    responseCode: error.responseCode || null
  };
}

function getAdminNotifyEmail() {
  return process.env.ADMIN_NOTIFY_EMAIL || process.env.SMTP_REPLY_TO || "support@whiteteakllc.com";
}

function createTransporter(config) {
  const relaxTls = String(process.env.SMTP_TLS_STRICT || "").toLowerCase() !== "true";
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 15000,
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 15000,
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 20000,
    tls: relaxTls ? { rejectUnauthorized: false } : undefined
  });
}

async function sendMailMessage({ to, subject, text, html, replyTo }) {
  const config = getMailerConfig();
  if (!config) {
    return {
      sent: false,
      mode: "dev",
      error: !nodemailer ? "nodemailer is not installed" : "SMTP_HOST, SMTP_USER, or SMTP_PASS is missing"
    };
  }

  try {
    await createTransporter(config).sendMail({
      from: config.from,
      replyTo: replyTo || config.replyTo,
      to,
      subject,
      text,
      html
    });
  } catch (error) {
    return { sent: false, mode: "smtp", error: formatMailerError(error) };
  }

  return { sent: true, mode: "smtp" };
}

async function sendEmail(message) {
  return sendMailMessage(message);
}

async function sendOtpEmail(email, otp, options = "") {
  const opts = typeof options === "string" ? { verifyLink: options } : (options || {});
  const verifyLink = opts.verifyLink || "";
  const expiresInMinutes = Number(opts.expiresInMinutes || 10);
  const linkBlockText = verifyLink
    ? `\n\nOr click this link to verify instantly:\n${verifyLink}\n`
    : "";
  const linkBlockHtml = verifyLink
    ? `<p>Or click the button below to verify instantly:</p>
       <p><a href="${escapeHtml(verifyLink)}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Verify my account</a></p>
       <p style="font-size:12px;color:#666">If the button doesn't work, paste this URL into your browser:<br><a href="${escapeHtml(verifyLink)}">${escapeHtml(verifyLink)}</a></p>`
    : "";

  const result = await sendMailMessage({
    to: email,
    subject: "Your WhiteTeak LLC verification code",
    text: `Your WhiteTeak LLC OTP is ${otp}. It is valid for ${expiresInMinutes} minutes.${linkBlockText}\n\n- WhiteTeak LLC Team (admin@whiteteakllc.com)`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px">
             <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
               <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;font-weight:800;display:inline-flex;align-items:center;justify-content:center;font-size:15px">WT</div>
               <strong style="font-size:18px;color:#111">WhiteTeak LLC</strong>
             </div>
             <h2 style="color:#111;margin:8px 0 4px">Welcome to WhiteTeak LLC</h2>
             <p style="margin:8px 0 14px;color:#333">Your verification code is:</p>
             <p style="font-size:32px;letter-spacing:6px;font-weight:700;background:#f4f4f6;padding:16px 24px;border-radius:8px;text-align:center;color:#111;margin:0">${escapeHtml(otp)}</p>
             <p style="margin:14px 0 8px;color:#444">This code is valid for ${expiresInMinutes} minutes.</p>
             ${linkBlockHtml}
             <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
             <p style="font-size:12px;color:#888">If you didn't request this, you can safely ignore this email. For account help, reply to this email or contact <a href="mailto:admin@whiteteakllc.com">admin@whiteteakllc.com</a>.</p>
           </div>`
  });

  return result.sent ? result : { ...result, otp, verifyLink };
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatOrderItems(items = []) {
  return items.map((item) => {
    const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
    return `${item.quantity || 1} x ${item.name || "Item"} - ${formatMoney(lineTotal)}`;
  }).join("\n");
}

function orderItemsRows(items = []) {
  return items.map((item) => {
    const qty = Number(item.quantity || 1);
    const price = Number(item.price || 0);
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(item.name || "Item")}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${qty}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatMoney(price)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatMoney(price * qty)}</td>
    </tr>`;
  }).join("");
}

async function sendOrderAdminEmail(order, items = []) {
  const to = getAdminNotifyEmail();
  const address = [order.address, order.city, order.state, order.pincode].filter(Boolean).join(", ");
  const subject = `New order ${order.order_code || ""} - WhiteTeak LLC`;
  const text = `New order received\n\nOrder: ${order.order_code}\nCustomer: ${order.customer_name}\nEmail: ${order.email}\nPhone: ${order.phone || ""}\nAddress: ${address}\nPayment: ${order.payment_method || "COD"}\nStatus: ${order.status || ""}\nTotal: ${formatMoney(order.total)}\n\nItems:\n${formatOrderItems(items)}\n\nCreated: ${order.created_at || ""}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;padding:24px;color:#111">
    <h2>New order ${escapeHtml(order.order_code || "")}</h2>
    <p><strong>Customer:</strong> ${escapeHtml(order.customer_name || "")}<br>
    <strong>Email:</strong> ${escapeHtml(order.email || "")}<br>
    <strong>Phone:</strong> ${escapeHtml(order.phone || "")}<br>
    <strong>Address:</strong> ${escapeHtml(address)}<br>
    <strong>Payment:</strong> ${escapeHtml(order.payment_method || "COD")} &middot; <strong>Status:</strong> ${escapeHtml(order.status || "")}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead><tr><th align="left" style="padding:8px;border-bottom:2px solid #ddd">Item</th><th style="padding:8px;border-bottom:2px solid #ddd">Qty</th><th align="right" style="padding:8px;border-bottom:2px solid #ddd">Unit</th><th align="right" style="padding:8px;border-bottom:2px solid #ddd">Line</th></tr></thead>
      <tbody>${orderItemsRows(items)}</tbody>
      <tfoot><tr><td colspan="3" align="right" style="padding:10px;font-weight:700">Total</td><td align="right" style="padding:10px;font-weight:700">${formatMoney(order.total)}</td></tr></tfoot>
    </table>
    <p style="font-size:12px;color:#666">Created ${escapeHtml(order.created_at || "")}</p>
  </div>`;
  return sendMailMessage({ to, subject, text, html, replyTo: order.email || undefined });
}

async function sendOrderCustomerEmail(order, items = []) {
  if (!order || !order.email) return { sent: false, mode: "skip", error: "missing customer email" };
  const subject = `Your WhiteTeak LLC order ${order.order_code || ""}`;
  const text = `Thanks for your order.\n\nOrder: ${order.order_code}\nStatus: ${order.status || ""}\nTotal: ${formatMoney(order.total)}\n\nItems:\n${formatOrderItems(items)}\n\nFor help, reply to this email.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111">
    <h2>Thanks for your order</h2>
    <p>Your order <strong>${escapeHtml(order.order_code || "")}</strong> has been received.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead><tr><th align="left" style="padding:8px;border-bottom:2px solid #ddd">Item</th><th style="padding:8px;border-bottom:2px solid #ddd">Qty</th><th align="right" style="padding:8px;border-bottom:2px solid #ddd">Line</th></tr></thead>
      <tbody>${items.map((item) => `<tr><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(item.name || "Item")}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${Number(item.quantity || 1)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatMoney(Number(item.price || 0) * Number(item.quantity || 1))}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="2" align="right" style="padding:10px;font-weight:700">Total</td><td align="right" style="padding:10px;font-weight:700">${formatMoney(order.total)}</td></tr></tfoot>
    </table>
    <p>We will update you as the order progresses. For help, reply to this email.</p>
  </div>`;
  return sendMailMessage({ to: order.email, subject, text, html });
}

async function sendCustomerInvoiceEmail(order, items = []) {
  if (!order || !order.email) return { sent: false, mode: "skip", error: "missing customer email" };
  const address = [order.address, order.city, order.state, order.pincode].filter(Boolean).join(", ");
  const invoiceNo = `INV-${order.order_code || "ORDER"}`;
  const subject = `Invoice ${invoiceNo} for your WhiteTeak LLC order`;
  const text = `Invoice ${invoiceNo}\n\nOrder: ${order.order_code}\nCustomer: ${order.customer_name || ""}\nEmail: ${order.email}\nPayment: ${order.payment_method || ""} - ${order.status || "Paid"}\nDate: ${order.created_at || ""}\nShip to: ${address}\n\nItems:\n${formatOrderItems(items)}\n\nGrand total: ${formatMoney(order.total)}\n\nThank you for shopping with WhiteTeak LLC. For help, reply to this email.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;padding:24px;color:#111;background:#fff">
    <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:3px solid #0d9488;padding-bottom:16px;margin-bottom:18px">
      <div><div style="font-size:22px;font-weight:800;color:#0f766e">WhiteTeak LLC</div><div style="font-size:12px;color:#64748b">Official tax invoice / receipt</div></div>
      <div style="text-align:right"><div style="font-size:13px;color:#64748b">Invoice</div><div style="font-size:18px;font-weight:800">${escapeHtml(invoiceNo)}</div></div>
    </div>
    <p><strong>Order:</strong> ${escapeHtml(order.order_code || "")}<br>
    <strong>Customer:</strong> ${escapeHtml(order.customer_name || "")}<br>
    <strong>Email:</strong> ${escapeHtml(order.email || "")}<br>
    <strong>Payment:</strong> ${escapeHtml(order.payment_method || "")} - ${escapeHtml(order.status || "Paid")}<br>
    <strong>Date:</strong> ${escapeHtml(order.created_at || "")}<br>
    <strong>Ship to:</strong> ${escapeHtml(address)}</p>
    <table style="width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #e5e7eb">
      <thead><tr style="background:#f8fafc"><th align="left" style="padding:10px;border-bottom:1px solid #e5e7eb">Item</th><th style="padding:10px;border-bottom:1px solid #e5e7eb">Qty</th><th align="right" style="padding:10px;border-bottom:1px solid #e5e7eb">Unit</th><th align="right" style="padding:10px;border-bottom:1px solid #e5e7eb">Line</th></tr></thead>
      <tbody>${orderItemsRows(items)}</tbody>
      <tfoot><tr><td colspan="3" align="right" style="padding:12px;font-weight:800;background:#f8fafc">Grand total</td><td align="right" style="padding:12px;font-weight:800;background:#f8fafc">${formatMoney(order.total)}</td></tr></tfoot>
    </table>
    <p style="font-size:13px;color:#475569">Thank you for shopping with WhiteTeak LLC. For support, reply to this email or contact <a href="mailto:support@whiteteakllc.com">support@whiteteakllc.com</a>.</p>
  </div>`;
  return sendMailMessage({ to: order.email, subject, text, html });
}

async function sendContactNotificationEmail(message) {
  const to = getAdminNotifyEmail();
  const subject = `Contact message: ${message.subject || "WhiteTeak LLC"}`;
  const text = `New contact message\n\nName: ${message.name || ""}\nEmail: ${message.email || ""}\nPhone: ${message.phone || ""}\nSubject: ${message.subject || ""}\nMessage:\n${message.message || ""}\n\nCreated: ${message.created_at || ""}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111">
    <h2>New contact message</h2>
    <p><strong>Name:</strong> ${escapeHtml(message.name || "")}<br>
    <strong>Email:</strong> ${escapeHtml(message.email || "")}<br>
    <strong>Phone:</strong> ${escapeHtml(message.phone || "")}<br>
    <strong>Subject:</strong> ${escapeHtml(message.subject || "")}</p>
    <div style="white-space:pre-wrap;background:#f7f7f8;border-radius:8px;padding:14px">${escapeHtml(message.message || "")}</div>
    <p style="font-size:12px;color:#666">Created ${escapeHtml(message.created_at || "")}</p>
  </div>`;
  return sendMailMessage({ to, subject, text, html, replyTo: message.email || undefined });
}

async function sendNewsletterNotificationEmail(email) {
  const to = getAdminNotifyEmail();
  const subject = "New WhiteTeak LLC newsletter subscriber";
  const text = `New newsletter subscriber: ${email}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;padding:24px"><h2>New newsletter subscriber</h2><p>${escapeHtml(email)}</p></div>`;
  return sendMailMessage({ to, subject, text, html });
}

async function sendSupportTokenEmail({ email, token }) {
  if (!email) return { sent: false, mode: "skip", error: "missing support email" };
  const subject = `Your WhiteTeak LLC support token ${token}`;
  const text = `Your support token is ${token}. Keep it for your support conversation.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;padding:24px"><h2>Support token</h2><p>Your support token is <strong>${escapeHtml(token)}</strong>.</p></div>`;
  return sendMailMessage({ to: email, subject, text, html });
}

module.exports = {
  getMailerConfig,
  sendEmail,
  sendMailMessage,
  sendOtpEmail,
  sendOrderAdminEmail,
  sendOrderCustomerEmail,
  sendCustomerInvoiceEmail,
  sendContactNotificationEmail,
  sendNewsletterNotificationEmail,
  sendSupportTokenEmail,
  getAdminNotifyEmail
};

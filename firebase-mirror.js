// Firebase Firestore mirror — dual-writes key collections (users, orders, contact
// messages, newsletter subs, OTP logs) whenever the sqlite primary store commits.
//
// Init is driven entirely by env vars so the app works with OR without Firebase:
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY   (paste the full string from service-account JSON,
//                           with \n kept literal; we normalise them at load time)
// OR a single JSON blob:
//   FIREBASE_SERVICE_ACCOUNT={"project_id":"…","client_email":"…","private_key":"…"}
//
// If none of those are set, every method resolves as a no-op so callers don't
// need to branch.

let admin = null;
try { admin = require("firebase-admin"); } catch { admin = null; }

let app = null;
let firestore = null;
let initialized = false;

function loadServiceAccount() {
  const blob = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (blob) {
    try {
      const parsed = JSON.parse(blob);
      if (parsed.private_key) parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
      return parsed;
    } catch (e) {
      console.warn("[firebase] FIREBASE_SERVICE_ACCOUNT is set but not valid JSON:", e.message);
      return null;
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;
  privateKey = String(privateKey).replace(/\\n/g, "\n");
  return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
}

function init() {
  if (initialized) return;
  initialized = true;
  if (!admin) {
    console.log("[firebase] firebase-admin package not installed; mirror disabled.");
    return;
  }
  const svc = loadServiceAccount();
  if (!svc) {
    console.log("[firebase] no service-account credentials in env; mirror disabled.");
    return;
  }
  try {
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: svc.project_id,
        clientEmail: svc.client_email,
        privateKey: svc.private_key
      })
    });
    firestore = admin.firestore(app);
    console.log("[firebase] Firestore mirror enabled for project", svc.project_id);
  } catch (e) {
    console.warn("[firebase] init failed — continuing without mirror:", e.message);
    app = null;
    firestore = null;
  }
}

function isEnabled() {
  if (!initialized) init();
  return Boolean(firestore);
}

async function safeWrite(collection, docId, data) {
  if (!isEnabled()) return { mirrored: false };
  try {
    const payload = { ...data, _mirroredAt: new Date().toISOString() };
    if (docId) await firestore.collection(collection).doc(String(docId)).set(payload, { merge: true });
    else await firestore.collection(collection).add(payload);
    return { mirrored: true };
  } catch (e) {
    console.warn(`[firebase] write ${collection}/${docId || "(auto)"} failed:`, e.message);
    return { mirrored: false, error: e.message };
  }
}

async function mirrorUser(user) {
  if (!user || !user.email) return { mirrored: false };
  // Omit password_hash from the mirrored doc for safety; Firestore is a backup,
  // not a secondary auth store.
  const { password_hash, ...safe } = user;
  return safeWrite("users", String(user.email).toLowerCase(), safe);
}

async function mirrorOrder(order) {
  if (!order || !order.order_code) return { mirrored: false };
  return safeWrite("orders", order.order_code, order);
}

async function mirrorContactMessage(message) {
  if (!message) return { mirrored: false };
  return safeWrite("contact_messages", null, message);
}

async function mirrorNewsletterSubscriber(email) {
  if (!email) return { mirrored: false };
  const lower = String(email).toLowerCase();
  return safeWrite("newsletter_subscribers", lower, { email: lower, created_at: new Date().toISOString() });
}

async function mirrorOtpLog(entry) {
  if (!entry || !entry.email) return { mirrored: false };
  // Store only metadata, never the code itself.
  const { code, code_hash, ...safe } = entry;
  return safeWrite("otp_log", null, safe);
}

async function mirrorPasswordReset(email) {
  if (!email) return { mirrored: false };
  return safeWrite("password_reset_log", null, {
    email: String(email).toLowerCase(),
    at: new Date().toISOString()
  });
}

module.exports = {
  init,
  isEnabled,
  mirrorUser,
  mirrorOrder,
  mirrorContactMessage,
  mirrorNewsletterSubscriber,
  mirrorOtpLog,
  mirrorPasswordReset,
  safeWrite
};

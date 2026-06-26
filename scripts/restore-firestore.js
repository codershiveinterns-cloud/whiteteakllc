const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const admin = require("firebase-admin");
const { openDatabase } = require("../db-shim");
const { hashPassword } = require("../data-layer");

function loadEnvFile(envPath) {
  const raw = fs.readFileSync(envPath, "utf8");
  const vars = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    vars[key] = value;
  }
  return vars;
}

function getServiceAccount(envVars) {
  const blob = String(envVars.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!blob) throw new Error("FIREBASE_SERVICE_ACCOUNT is missing from .env");
  const svc = JSON.parse(blob);
  svc.private_key = String(svc.private_key || "").replace(/\\n/g, "\n");
  return svc;
}

async function readCollection(firestore, name) {
  try {
    return (await firestore.collection(name).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn(`[restore] ${name} skipped:`, error.message);
    return [];
  }
}

async function main() {
  const root = path.join(__dirname, "..");
  const envPath = path.join(root, ".env");
  const dbPath = path.join(root, "data", "store.db");
  const envVars = loadEnvFile(envPath);
  const svc = getServiceAccount(envVars);
  const backupPath = `${dbPath}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: svc.project_id,
        clientEmail: svc.client_email,
        privateKey: svc.private_key
      })
    });
  }

  const firestore = admin.firestore();
  const db = await openDatabase(dbPath);

  db.exec("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT,order_code TEXT UNIQUE NOT NULL,customer_name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,city TEXT NOT NULL,state TEXT NOT NULL,pincode TEXT NOT NULL,status TEXT NOT NULL,total INTEGER NOT NULL,items_json TEXT NOT NULL,created_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS otp_codes (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL,code_hash TEXT NOT NULL,purpose TEXT NOT NULL,expires_at TEXT NOT NULL,consumed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,session_token TEXT UNIQUE NOT NULL,user_email TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS newsletter_subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS contact_messages (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT,subject TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS support_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT,token TEXT UNIQUE NOT NULL,email TEXT,created_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS email_events (id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,recipient TEXT NOT NULL,subject TEXT NOT NULL,status TEXT NOT NULL,error TEXT,related_ref TEXT,created_at TEXT NOT NULL)");
  try { db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'COD'"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN paypal_order_id TEXT"); } catch {}
  try { db.exec("ALTER TABLE orders ADD COLUMN paypal_capture_id TEXT"); } catch {}

  const userRows = await readCollection(firestore, "users");
  const orderRows = await readCollection(firestore, "orders");
  const contactRows = await readCollection(firestore, "contact_messages");
  const newsletterRows = await readCollection(firestore, "newsletter_subscribers");
  const otpRows = await readCollection(firestore, "otp_log");
  const supportTokenRows = await readCollection(firestore, "support_tokens");
  const emailEventRows = await readCollection(firestore, "email_events");

  const upsertUser = db.prepare(
    "INSERT INTO users (name, email, password_hash, verified, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET name=excluded.name, password_hash=CASE WHEN excluded.password_hash = '' THEN users.password_hash ELSE excluded.password_hash END, verified=excluded.verified, created_at=excluded.created_at"
  );
  const upsertOrder = db.prepare(
    "INSERT INTO orders (order_code, customer_name, email, phone, address, city, state, pincode, status, total, items_json, created_at, payment_method, paypal_order_id, paypal_capture_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(order_code) DO UPDATE SET customer_name=excluded.customer_name, email=excluded.email, phone=excluded.phone, address=excluded.address, city=excluded.city, state=excluded.state, pincode=excluded.pincode, status=excluded.status, total=excluded.total, items_json=excluded.items_json, created_at=excluded.created_at, payment_method=excluded.payment_method, paypal_order_id=excluded.paypal_order_id, paypal_capture_id=excluded.paypal_capture_id"
  );
  const insertContact = db.prepare("INSERT INTO contact_messages (name, email, phone, subject, message, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const upsertNewsletter = db.prepare("INSERT INTO newsletter_subscribers (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET created_at=excluded.created_at");
  const upsertSupportToken = db.prepare("INSERT INTO support_tokens (token, email, created_at) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET email=excluded.email, created_at=excluded.created_at");
  const insertEmailEvent = db.prepare("INSERT INTO email_events (kind, recipient, subject, status, error, related_ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insertOtpMeta = db.prepare("INSERT INTO otp_codes (email, code_hash, purpose, expires_at, consumed, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const getLocalUser = db.prepare("SELECT id FROM users WHERE email = ?");

  for (const user of userRows) {
    const email = String(user.email || "").toLowerCase();
    if (!email) continue;
    const passwordHash = String(user.password_hash || "") || (getLocalUser.get(email) ? "" : hashPassword(crypto.randomUUID()));
    upsertUser.run(String(user.name || email), email, passwordHash, Number(user.verified || 0), String(user.created_at || new Date().toISOString()));
  }

  for (const order of orderRows) {
    const orderCode = String(order.order_code || order.id || "");
    if (!orderCode) continue;
    const itemsJson = typeof order.items_json === "string" ? order.items_json : JSON.stringify(order.items || []);
    upsertOrder.run(
      orderCode,
      String(order.customer_name || order.customerName || ""),
      String(order.email || "").toLowerCase(),
      String(order.phone || ""),
      String(order.address || ""),
      String(order.city || ""),
      String(order.state || ""),
      String(order.pincode || ""),
      String(order.status || ""),
      Number(order.total || 0),
      itemsJson,
      String(order.created_at || order._mirroredAt || new Date().toISOString()),
      String(order.payment_method || order.paymentMethod || "COD"),
      order.paypal_order_id ? String(order.paypal_order_id) : null,
      order.paypal_capture_id ? String(order.paypal_capture_id) : null
    );
  }

  for (const contact of contactRows) {
    insertContact.run(String(contact.name || ""), String(contact.email || "").toLowerCase(), String(contact.phone || ""), String(contact.subject || ""), String(contact.message || ""), String(contact.created_at || contact._mirroredAt || new Date().toISOString()));
  }

  for (const entry of newsletterRows) {
    const email = String(entry.email || entry.id || "").toLowerCase();
    if (!email) continue;
    upsertNewsletter.run(email, String(entry.created_at || entry._mirroredAt || new Date().toISOString()));
  }

  for (const entry of supportTokenRows) {
    const token = String(entry.token || entry.id || "");
    if (!token) continue;
    upsertSupportToken.run(token, String(entry.email || "").toLowerCase(), String(entry.created_at || entry._mirroredAt || new Date().toISOString()));
  }

  for (const entry of emailEventRows) {
    insertEmailEvent.run(String(entry.kind || "email"), String(entry.recipient || ""), String(entry.subject || ""), String(entry.status || ""), String(entry.error || ""), String(entry.related_ref || ""), String(entry.created_at || entry._mirroredAt || new Date().toISOString()));
  }

  for (const entry of otpRows) {
    const email = String(entry.email || "").toLowerCase();
    if (!email) continue;
    // Restore metadata only. The original OTP code/hash is intentionally not mirrored.
    insertOtpMeta.run(email, hashPassword(crypto.randomUUID()), String(entry.purpose || "unknown"), String(entry.expires_at || new Date().toISOString()), 1, String(entry.created_at || entry._mirroredAt || new Date().toISOString()));
  }

  if (db.save) db.save();

  const counts = {
    users: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
    orders: db.prepare("SELECT COUNT(*) AS c FROM orders").get().c,
    customersFromOrders: db.prepare("SELECT COUNT(DISTINCT email) AS c FROM orders").get().c,
    contactMessages: db.prepare("SELECT COUNT(*) AS c FROM contact_messages").get().c,
    newsletterSubscribers: db.prepare("SELECT COUNT(*) AS c FROM newsletter_subscribers").get().c,
    supportTokens: db.prepare("SELECT COUNT(*) AS c FROM support_tokens").get().c,
    emailEvents: db.prepare("SELECT COUNT(*) AS c FROM email_events").get().c,
    otpMetadata: db.prepare("SELECT COUNT(*) AS c FROM otp_codes").get().c
  };

  console.log(JSON.stringify({
    backupPath: fs.existsSync(backupPath) ? backupPath : null,
    restoredUsers: userRows.length,
    restoredOrders: orderRows.length,
    restoredContactMessages: contactRows.length,
    restoredNewsletterSubscribers: newsletterRows.length,
    restoredSupportTokens: supportTokenRows.length,
    restoredEmailEvents: emailEventRows.length,
    restoredOtpMetadata: otpRows.length,
    counts
  }, null, 2));
}

main().catch((error) => {
  if (error && error.code === 16) {
    console.error("Firestore authentication failed. Replace FIREBASE_SERVICE_ACCOUNT in .env with a fresh Firebase Admin SDK service-account JSON for the whiteteakllc-a1a23 project, then run npm.cmd run restore:firestore again.");
  }
  console.error(error);
  process.exit(1);
});

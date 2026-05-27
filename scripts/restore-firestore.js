const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { openDatabase } = require("../db-shim");

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

async function main() {
  const root = path.join(__dirname, "..");
  const envPath = path.join(root, ".env");
  const dbPath = path.join(root, "data", "store.db");
  const envVars = loadEnvFile(envPath);
  const svc = getServiceAccount(envVars);

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

  db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS otp_codes (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL,code_hash TEXT NOT NULL,purpose TEXT NOT NULL,expires_at TEXT NOT NULL,consumed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,session_token TEXT UNIQUE NOT NULL,user_email TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL)");
  try {
    db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'COD'");
  } catch {}

  const userRows = (await firestore.collection("users").get()).docs.map((doc) => doc.data());
  const orderRows = (await firestore.collection("orders").get()).docs.map((doc) => doc.data());

  const upsertUser = db.prepare(
    "INSERT INTO users (name, email, password_hash, verified, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET name=excluded.name, password_hash=excluded.password_hash, verified=excluded.verified, created_at=excluded.created_at"
  );
  const upsertOrder = db.prepare(
    "INSERT INTO orders (order_code, customer_name, email, phone, address, city, state, pincode, status, total, items_json, created_at, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(order_code) DO UPDATE SET customer_name=excluded.customer_name, email=excluded.email, phone=excluded.phone, address=excluded.address, city=excluded.city, state=excluded.state, pincode=excluded.pincode, status=excluded.status, total=excluded.total, items_json=excluded.items_json, created_at=excluded.created_at, payment_method=excluded.payment_method"
  );

  for (const user of userRows) {
    upsertUser.run(
      String(user.name || ""),
      String(user.email || "").toLowerCase(),
      String(user.password_hash || ""),
      Number(user.verified || 0),
      String(user.created_at || new Date().toISOString())
    );
  }

  for (const order of orderRows) {
    const itemsJson = typeof order.items_json === "string"
      ? order.items_json
      : JSON.stringify(order.items || []);
    upsertOrder.run(
      String(order.order_code || ""),
      String(order.customer_name || ""),
      String(order.email || "").toLowerCase(),
      String(order.phone || ""),
      String(order.address || ""),
      String(order.city || ""),
      String(order.state || ""),
      String(order.pincode || ""),
      String(order.status || ""),
      Number(order.total || 0),
      itemsJson,
      String(order.created_at || new Date().toISOString()),
      String(order.payment_method || "COD")
    );
  }

  if (db.save) db.save();

  const counts = {
    users: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
    orders: db.prepare("SELECT COUNT(*) AS c FROM orders").get().c,
    customersFromOrders: db.prepare("SELECT COUNT(DISTINCT email) AS c FROM orders").get().c
  };

  console.log(JSON.stringify({
    restoredUsers: userRows.length,
    restoredOrders: orderRows.length,
    counts
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

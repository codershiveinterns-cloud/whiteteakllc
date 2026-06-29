const crypto = require("crypto");
let MongoClient;
let fbMirror = null;

try {
  ({ MongoClient } = require("mongodb"));
} catch {
  MongoClient = null;
}

try { fbMirror = require("./firebase-mirror"); } catch { fbMirror = null; }

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function emailDocId(email) {
  return Buffer.from(normalizeEmail(email)).toString("base64url");
}

function otpDocId(email, purpose) {
  return `${emailDocId(email)}_${String(purpose || "auth").replace(/[^a-z0-9_-]/gi, "_")}`;
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

class SqliteStore {
  constructor(db) {
    this.backend = "sqlite";
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS otp_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_token TEXT UNIQUE NOT NULL,
        user_email TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    this.ensureDefaultAdmin();
  }

  saveDbSafe(scope = "data-layer") {
    try {
      if (this.db && typeof this.db.save === "function") this.db.save();
    } catch (error) {
      console.warn(`[${scope}] db save failed:`, error.message);
    }
  }

  ensureDefaultAdmin() {
    const email = "admin@whiteteakllc.com";
    const existing = this.db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) return;
    const now = new Date().toISOString();
    const passwordHash = hashPassword("Admin@123");
    this.db.prepare(
      "INSERT INTO users (name, email, password_hash, verified, created_at) VALUES (?, ?, ?, 1, ?)"
    ).run("WhiteTeak Admin", email, passwordHash, now);
    this.saveDbSafe("default-admin");
  }

  async getUserByEmail(email) {
    return this.db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email)) || null;
  }

  async createUser({ name, email, password }) {
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);
    this.db.prepare(
      "INSERT INTO users (name, email, password_hash, verified, created_at) VALUES (?, ?, ?, 0, ?)"
    ).run(name, normalizeEmail(email), passwordHash, now);
    this.saveDbSafe("create-user");
    return this.getUserByEmail(email);
  }

  async markUserVerified(email) {
    this.db.prepare("UPDATE users SET verified = 1 WHERE email = ?").run(normalizeEmail(email));
    this.saveDbSafe("verify-user");
  }

  async updateUserPassword(email, newPassword) {
    const passwordHash = hashPassword(newPassword);
    this.db.prepare("UPDATE users SET password_hash = ? WHERE email = ?").run(passwordHash, normalizeEmail(email));
    this.saveDbSafe("update-password");
    return passwordHash;
  }

  async saveOtp({ email, code, purpose, expiresAt }) {
    const now = new Date().toISOString();
    const codeHash = hashPassword(code);
    this.db.prepare("UPDATE otp_codes SET consumed = 1 WHERE email = ? AND purpose = ? AND consumed = 0").run(normalizeEmail(email), purpose);
    this.db.prepare(
      "INSERT INTO otp_codes (email, code_hash, purpose, expires_at, consumed, created_at) VALUES (?, ?, ?, ?, 0, ?)"
    ).run(normalizeEmail(email), codeHash, purpose, expiresAt, now);
    this.saveDbSafe("save-otp");
  }

  async verifyOtp({ email, code, purpose }) {
    const row = this.db.prepare(
      "SELECT * FROM otp_codes WHERE email = ? AND purpose = ? AND consumed = 0 ORDER BY id DESC LIMIT 1"
    ).get(normalizeEmail(email), purpose);
    if (!row) return false;
    if (new Date(row.expires_at).getTime() < Date.now()) return false;
    const ok = verifyPassword(code, row.code_hash);
    if (!ok) return false;
    this.db.prepare("UPDATE otp_codes SET consumed = 1 WHERE id = ?").run(row.id);
    this.saveDbSafe("consume-otp");
    return true;
  }

  async createSession(email) {
    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    this.db.prepare(
      "INSERT INTO sessions (session_token, user_email, expires_at, created_at) VALUES (?, ?, ?, ?)"
    ).run(token, normalizeEmail(email), expiresAt, now);
    this.saveDbSafe("create-session");
    return { token, expiresAt };
  }

  async getSession(token) {
    const row = this.db.prepare("SELECT * FROM sessions WHERE session_token = ?").get(token);
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    const user = await this.getUserByEmail(row.user_email);
    return user ? { ...row, user } : null;
  }

  async deleteSession(token) {
    this.db.prepare("DELETE FROM sessions WHERE session_token = ?").run(token);
    this.saveDbSafe("delete-session");
  }
}

class FirestoreAuthStore {
  constructor(sqliteStore, firestore) {
    this.backend = "firestore";
    this.sqliteStore = sqliteStore;
    this.firestore = firestore;
  }

  userRef(email) {
    return this.firestore.collection("auth_users").doc(emailDocId(email));
  }

  otpRef(email, purpose) {
    return this.firestore.collection("auth_otp_codes").doc(otpDocId(email, purpose));
  }

  sessionRef(token) {
    return this.firestore.collection("auth_sessions").doc(String(token));
  }

  normalizeUser(doc) {
    if (!doc || !doc.exists) return null;
    const data = doc.data() || {};
    return {
      id: doc.id,
      name: data.name || data.email || "User",
      email: normalizeEmail(data.email),
      password_hash: data.password_hash || "",
      verified: data.verified ? 1 : 0,
      created_at: data.created_at || new Date().toISOString()
    };
  }

  async getUserByEmail(email) {
    const snap = await this.userRef(email).get();
    return this.normalizeUser(snap);
  }

  async createUser({ name, email, password }) {
    const lower = normalizeEmail(email);
    const ref = this.userRef(lower);
    const existing = await ref.get();
    if (existing.exists) return this.normalizeUser(existing);
    const now = new Date().toISOString();
    const user = {
      name,
      email: lower,
      password_hash: hashPassword(password),
      verified: 0,
      created_at: now
    };
    await ref.set(user, { merge: false });
    if (fbMirror) { try { await fbMirror.mirrorUser(user); } catch (_) {} }
    return { id: ref.id, ...user };
  }

  async markUserVerified(email) {
    const lower = normalizeEmail(email);
    await this.userRef(lower).set({ email: lower, verified: 1, verified_at: new Date().toISOString() }, { merge: true });
    if (fbMirror) {
      try {
        const user = await this.getUserByEmail(lower);
        if (user) await fbMirror.mirrorUser(user);
      } catch (_) { /* mirror is best-effort */ }
    }
  }

  async updateUserPassword(email, newPassword) {
    const lower = normalizeEmail(email);
    const passwordHash = hashPassword(newPassword);
    await this.userRef(lower).set({ email: lower, password_hash: passwordHash, updated_at: new Date().toISOString() }, { merge: true });
    if (fbMirror) { try { await fbMirror.mirrorPasswordReset(lower); } catch (_) {} }
    return passwordHash;
  }

  async saveOtp({ email, code, purpose, expiresAt }) {
    const lower = normalizeEmail(email);
    const now = new Date().toISOString();
    const entry = {
      email: lower,
      purpose,
      code_hash: hashPassword(code),
      expires_at: expiresAt,
      consumed: false,
      created_at: now
    };
    await this.otpRef(lower, purpose).set(entry, { merge: false });
    if (fbMirror) {
      try {
        await fbMirror.mirrorOtpLog({
          email: lower,
          purpose,
          expires_at: expiresAt,
          created_at: now
        });
      } catch (_) { /* mirror is best-effort */ }
    }
  }

  async verifyOtp({ email, code, purpose }) {
    const ref = this.otpRef(email, purpose);
    const snap = await ref.get();
    if (!snap.exists) return false;
    const row = snap.data() || {};
    if (row.consumed) return false;
    if (normalizeEmail(row.email) !== normalizeEmail(email)) return false;
    if (String(row.purpose) !== String(purpose)) return false;
    if (new Date(row.expires_at).getTime() < Date.now()) return false;
    const ok = verifyPassword(code, row.code_hash);
    if (!ok) return false;
    await ref.set({ consumed: true, consumed_at: new Date().toISOString() }, { merge: true });
    return true;
  }

  async createSession(email) {
    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    await this.sessionRef(token).set({
      session_token: token,
      user_email: normalizeEmail(email),
      expires_at: expiresAt,
      created_at: now
    });
    return { token, expiresAt };
  }

  async getSession(token) {
    const ref = this.sessionRef(token);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const row = snap.data() || {};
    if (new Date(row.expires_at).getTime() < Date.now()) {
      try { await ref.delete(); } catch (_) {}
      return null;
    }
    const user = await this.getUserByEmail(row.user_email);
    return user ? { ...row, user } : null;
  }

  async deleteSession(token) {
    await this.sessionRef(token).delete();
  }
}

class MongoMirrorStore {
  constructor(sqliteStore, uri) {
    this.backend = "mongo-mirror";
    this.sqliteStore = sqliteStore;
    this.uri = uri;
    this.client = null;
    this.db = null;
  }

  async init() {
    if (!MongoClient || !this.uri) return;
    try {
      this.client = new MongoClient(this.uri);
      await this.client.connect();
      this.db = this.client.db();
      await this.db.collection("users").createIndex({ email: 1 }, { unique: true });
      await this.db.collection("sessions").createIndex({ session_token: 1 }, { unique: true });
    } catch {
      this.db = null;
    }
  }

  async getUserByEmail(email) {
    if (this.db) {
      const user = await this.db.collection("users").findOne({ email: normalizeEmail(email) });
      if (user) return user;
    }
    return this.sqliteStore.getUserByEmail(email);
  }

  async createUser(payload) {
    const user = await this.sqliteStore.createUser(payload);
    if (this.db) {
      await this.db.collection("users").updateOne(
        { email: user.email },
        { $set: user },
        { upsert: true }
      );
    }
    if (fbMirror) { try { await fbMirror.mirrorUser(user); } catch (_) {} }
    return user;
  }

  async markUserVerified(email) {
    await this.sqliteStore.markUserVerified(email);
    if (this.db) {
      await this.db.collection("users").updateOne(
        { email: normalizeEmail(email) },
        { $set: { verified: 1 } }
      );
    }
    if (fbMirror) {
      try {
        const user = await this.sqliteStore.getUserByEmail(email);
        if (user) await fbMirror.mirrorUser(user);
      } catch (_) { /* mirror is best-effort */ }
    }
  }

  async updateUserPassword(email, newPassword) {
    const passwordHash = await this.sqliteStore.updateUserPassword(email, newPassword);
    if (this.db) {
      await this.db.collection("users").updateOne(
        { email: normalizeEmail(email) },
        { $set: { password_hash: passwordHash } }
      );
    }
    if (fbMirror) { try { await fbMirror.mirrorPasswordReset(email); } catch (_) {} }
    return passwordHash;
  }

  async saveOtp(payload) {
    await this.sqliteStore.saveOtp(payload);
    if (this.db) {
      await this.db.collection("otp_codes").insertOne({
        email: normalizeEmail(payload.email),
        purpose: payload.purpose,
        expires_at: payload.expiresAt,
        created_at: new Date().toISOString()
      });
    }
    if (fbMirror) {
      try {
        await fbMirror.mirrorOtpLog({
          email: normalizeEmail(payload.email),
          purpose: payload.purpose,
          expires_at: payload.expiresAt,
          created_at: new Date().toISOString()
        });
      } catch (_) { /* mirror is best-effort */ }
    }
  }

  async verifyOtp(payload) {
    return this.sqliteStore.verifyOtp(payload);
  }

  async createSession(email) {
    const session = await this.sqliteStore.createSession(email);
    if (this.db) {
      await this.db.collection("sessions").updateOne(
        { session_token: session.token },
        { $set: { session_token: session.token, user_email: normalizeEmail(email), expires_at: session.expiresAt } },
        { upsert: true }
      );
    }
    return session;
  }

  async getSession(token) {
    return this.sqliteStore.getSession(token);
  }

  async deleteSession(token) {
    await this.sqliteStore.deleteSession(token);
    if (this.db) {
      await this.db.collection("sessions").deleteOne({ session_token: token });
    }
  }
}

async function createDataLayer(db, mongoUri) {
  const sqliteStore = new SqliteStore(db);

  if (fbMirror && fbMirror.isEnabled && fbMirror.isEnabled() && fbMirror.getFirestore) {
    const firestore = fbMirror.getFirestore();
    if (firestore) return new FirestoreAuthStore(sqliteStore, firestore);
  }

  if (isProductionRuntime()) {
    throw new Error("Firebase Firestore credentials are required for auth/OTP/session persistence on Vercel. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.");
  }

  if (mongoUri) {
    const store = new MongoMirrorStore(sqliteStore, mongoUri);
    await store.init();
    return store;
  }

  return sqliteStore;
}

module.exports = {
  createDataLayer,
  hashPassword,
  verifyPassword
};

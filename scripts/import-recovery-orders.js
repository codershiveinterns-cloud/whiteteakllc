const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const Database = require("better-sqlite3");

const root = path.join(__dirname, "..");
const DEFAULT_SHEET = path.join(root, "recovery-mails", "Detailed_Order_Sheet_Updated.xlsx");
const dbPath = path.join(root, "data", "store.db");

function parseArgs(argv) {
  const args = { sheet: DEFAULT_SHEET, dryRun: false, mirror: true };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-mirror") args.mirror = false;
    else if (arg.startsWith("--sheet=")) args.sheet = path.resolve(arg.slice("--sheet=".length));
  }
  return args;
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function xmlUnescape(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function columnIndex(cellRef) {
  const letters = String(cellRef || "").replace(/[^A-Z]/gi, "").toUpperCase();
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function readZipEntries(filePath) {
  const buf = fs.readFileSync(filePath);
  const u16 = (offset) => buf.readUInt16LE(offset);
  const u32 = (offset) => buf.readUInt32LE(offset);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Invalid xlsx file: central directory not found");

  const total = u16(eocd + 10);
  let offset = u32(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < total; i += 1) {
    if (u32(offset) !== 0x02014b50) throw new Error("Invalid xlsx file: bad central directory entry");
    const method = u16(offset + 10);
    const compressedSize = u32(offset + 20);
    const nameLength = u16(offset + 28);
    const extraLength = u16(offset + 30);
    const commentLength = u16(offset + 32);
    const localOffset = u32(offset + 42);
    const name = buf.slice(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    read(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      const localOffset = entry.localOffset;
      if (u32(localOffset) !== 0x04034b50) throw new Error(`Invalid xlsx file: bad local header for ${name}`);
      const nameLength = u16(localOffset + 26);
      const extraLength = u16(localOffset + 28);
      const start = localOffset + 30 + nameLength + extraLength;
      const data = buf.slice(start, start + entry.compressedSize);
      if (entry.method === 0) return data.toString("utf8");
      if (entry.method === 8) return zlib.inflateRawSync(data).toString("utf8");
      throw new Error(`Unsupported xlsx compression method ${entry.method}`);
    }
  };
}

function parseSheet(filePath) {
  const zip = readZipEntries(filePath);
  const sheetXml = zip.read("xl/worksheets/sheet1.xml");
  const sharedXml = zip.read("xl/sharedStrings.xml");
  if (!sheetXml) throw new Error("No worksheet found at xl/worksheets/sheet1.xml");

  const sharedStrings = [];
  if (sharedXml) {
    for (const match of sharedXml.matchAll(/<si[\s\S]*?<\/si>/g)) {
      const text = [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlUnescape(m[1])).join("");
      sharedStrings.push(text);
    }
  }

  const rows = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const attrs = cellMatch[1] || cellMatch[3] || "";
      const body = cellMatch[2] || "";
      const ref = /\br="([^"]+)"/.exec(attrs)?.[1] || "";
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] || "";
      const idx = columnIndex(ref);
      let value = "";
      if (type === "inlineStr") {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlUnescape(m[1])).join("");
      } else {
        const raw = /<v[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] || "";
        value = type === "s" ? (sharedStrings[Number(raw)] || "") : xmlUnescape(raw);
      }
      values[idx] = String(value || "").trim();
    }
    rows.push(values.map((value) => value || ""));
  }

  const headers = rows.shift() || [];
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

const INDIAN_STATES = new Set([
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi",
  "Chandigarh", "Jammu and Kashmir", "Ladakh", "Puducherry"
]);

function splitAddress(rawAddress) {
  const raw = String(rawAddress || "").trim();
  const pincode = /\b(\d{6})\b/.exec(raw)?.[1] || "";
  const withoutPin = raw.replace(/\b\d{6}\b/g, "").trim().replace(/\s+/g, " ");
  let state = "";
  for (const candidate of [...INDIAN_STATES].sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(withoutPin)) {
      state = candidate;
      break;
    }
  }
  let city = withoutPin;
  if (state) city = withoutPin.replace(new RegExp(`\\b${state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "").trim();
  if (!city && state) city = state;
  return { address: raw, city, state, pincode };
}

function normalizeProductName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findProduct(products, sheetName) {
  const wanted = normalizeProductName(sheetName);
  if (!wanted) return null;
  return products.find((p) => normalizeProductName(p.name).includes(wanted))
    || products.find((p) => wanted.includes(normalizeProductName(p.name)))
    || null;
}

function buildOrders(rows, products) {
  const orders = [];
  let current = null;

  for (const row of rows) {
    const orderId = String(row["Order ID"] || "").trim();
    if (!orderId) continue;
    const hasCustomerDetails = Boolean(String(row.Email || "").trim());
    if (hasCustomerDetails || !current) {
      const addressParts = splitAddress(row.Address);
      current = {
        baseOrderId: orderId,
        customer_name: String(row.Customer || "").trim(),
        email: String(row.Email || "").trim().toLowerCase(),
        phone: String(row.Phone || "").trim(),
        address: addressParts.address,
        city: addressParts.city,
        state: addressParts.state,
        pincode: addressParts.pincode,
        payment_method: String(row.Payment || "COD").trim() || "COD",
        status: String(row.Status || "Pending").trim() || "Pending",
        total: Number(row["Order Total"] || 0),
        created_at: String(row.Created || "").trim(),
        items: []
      };
      orders.push(current);
    }

    const productName = String(row.Product || "").trim();
    if (productName) {
      const product = findProduct(products, productName);
      current.items.push({
        id: product ? product.id : null,
        name: product ? product.name : productName,
        price: Number(row["Unit Price"] || (product ? product.price : 0)),
        quantity: Number(row.Qty || 1)
      });
    }
  }

  return orders.filter((order) => order.email && order.items.length > 0);
}

function ensureOrderSchema(db) {
  db.exec("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT,order_code TEXT UNIQUE NOT NULL,customer_name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,city TEXT NOT NULL,state TEXT NOT NULL,pincode TEXT NOT NULL,status TEXT NOT NULL,total INTEGER NOT NULL,items_json TEXT NOT NULL,created_at TEXT NOT NULL)");
  try { db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'COD'"); } catch (_) {}
  try { db.exec("ALTER TABLE orders ADD COLUMN paypal_order_id TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE orders ADD COLUMN paypal_capture_id TEXT"); } catch (_) {}
  try { db.exec("ALTER TABLE orders ADD COLUMN account_email TEXT"); } catch (_) {}
}

function chooseOrderCode(db, order, usedCodes) {
  const base = order.baseOrderId;
  const exact = db.prepare("SELECT order_code, email, total FROM orders WHERE order_code = ?").get(base);
  if (!usedCodes.has(base) && (!exact || String(exact.email || "").toLowerCase() === order.email)) {
    usedCodes.add(base);
    return base;
  }

  const existingRecovery = db.prepare("SELECT order_code FROM orders WHERE email = ? AND total = ? AND order_code LIKE ? ORDER BY order_code LIMIT 1")
    .get(order.email, order.total, `${base}-REC%`);
  if (existingRecovery && !usedCodes.has(existingRecovery.order_code)) {
    usedCodes.add(existingRecovery.order_code);
    return existingRecovery.order_code;
  }

  for (let i = 1; i < 100; i += 1) {
    const candidate = `${base}-REC${i}`;
    if (usedCodes.has(candidate)) continue;
    const found = db.prepare("SELECT 1 FROM orders WHERE order_code = ?").get(candidate);
    if (!found) {
      usedCodes.add(candidate);
      return candidate;
    }
  }
  throw new Error(`Could not allocate unique recovery order code for ${base}`);
}

function mergeOrder(existing, incoming) {
  if (!existing) return incoming;
  const merged = { ...incoming };
  for (const key of ["customer_name", "email", "phone", "address", "city", "state", "pincode", "status", "payment_method", "created_at"]) {
    if (existing[key] && String(existing[key]).trim()) merged[key] = existing[key];
  }
  if (Number(existing.total || 0) > 0) merged.total = Number(existing.total);
  if (existing.paypal_order_id) merged.paypal_order_id = existing.paypal_order_id;
  if (existing.paypal_capture_id) merged.paypal_capture_id = existing.paypal_capture_id;
  return merged;
}

async function mirrorOrders(rows) {
  const fbMirror = require("../firebase-mirror");
  if (!fbMirror.isEnabled()) return { enabled: false, mirrored: 0, failed: 0 };
  let mirrored = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await fbMirror.mirrorOrder(row);
    if (result && result.mirrored) mirrored += 1;
    else failed += 1;
  }
  return { enabled: true, mirrored, failed };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.sheet)) throw new Error(`Sheet not found: ${args.sheet}`);
  if (!fs.existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);

  loadEnvFile(path.join(root, ".env"));

  const db = new Database(dbPath);
  ensureOrderSchema(db);
  const products = db.prepare("SELECT id, name, price FROM products").all();
  const sheetRows = parseSheet(args.sheet);
  const recoveryOrders = buildOrders(sheetRows, products);

  const backupPath = `${dbPath}.backup-recovery-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const upsert = db.prepare(`
    INSERT INTO orders
      (order_code, customer_name, email, phone, address, city, state, pincode, status, total, items_json, created_at, payment_method, paypal_order_id, paypal_capture_id, account_email)
    VALUES
      (@order_code, @customer_name, @email, @phone, @address, @city, @state, @pincode, @status, @total, @items_json, @created_at, @payment_method, @paypal_order_id, @paypal_capture_id, @account_email)
    ON CONFLICT(order_code) DO UPDATE SET
      customer_name=excluded.customer_name,
      email=excluded.email,
      phone=excluded.phone,
      address=excluded.address,
      city=excluded.city,
      state=excluded.state,
      pincode=excluded.pincode,
      status=excluded.status,
      total=excluded.total,
      items_json=excluded.items_json,
      created_at=excluded.created_at,
      payment_method=excluded.payment_method,
      paypal_order_id=COALESCE(orders.paypal_order_id, excluded.paypal_order_id),
      paypal_capture_id=COALESCE(orders.paypal_capture_id, excluded.paypal_capture_id),
      account_email=COALESCE(orders.account_email, excluded.account_email)
  `);
  const getOrder = db.prepare("SELECT * FROM orders WHERE order_code = ?");

  const usedCodes = new Set();
  const prepared = recoveryOrders.map((order) => {
    const order_code = chooseOrderCode(db, order, usedCodes);
    const existing = getOrder.get(order_code);
    const created_at = order.created_at || existing?.created_at || new Date().toISOString();
    const incoming = {
      order_code,
      customer_name: order.customer_name,
      email: order.email,
      phone: order.phone,
      address: order.address,
      city: order.city,
      state: order.state,
      pincode: order.pincode,
      status: order.status,
      total: order.total,
      items_json: JSON.stringify(order.items),
      created_at,
      payment_method: order.payment_method,
      paypal_order_id: existing?.paypal_order_id || null,
      paypal_capture_id: existing?.paypal_capture_id || null,
      account_email: order.email
    };
    return mergeOrder(existing, incoming);
  });

  if (!args.dryRun) {
    fs.copyFileSync(dbPath, backupPath);
    const tx = db.transaction((rows) => {
      for (const row of rows) upsert.run(row);
    });
    tx(prepared);
  }

  let mirror = { enabled: false, mirrored: 0, failed: 0 };
  if (!args.dryRun && args.mirror) mirror = await mirrorOrders(prepared);

  const finalCount = db.prepare("SELECT COUNT(*) AS c FROM orders").get().c;
  console.log(JSON.stringify({
    dryRun: args.dryRun,
    sheet: path.relative(root, args.sheet),
    parsedSheetRows: sheetRows.length,
    preparedOrders: prepared.map((order) => ({
      order_code: order.order_code,
      customer_name: order.customer_name,
      item_count: JSON.parse(order.items_json).length,
      total: order.total,
      status: order.status,
      created_at: order.created_at
    })),
    backupPath: args.dryRun ? null : path.relative(root, backupPath),
    finalOrderCount: finalCount,
    firestoreMirror: mirror
  }, null, 2));

  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

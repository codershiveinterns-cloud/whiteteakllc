// Convert all product prices from INR to USD clamped to [69, 5000].
// Formula: price_usd = clamp(round(price_inr / 85), 69, 5000).
// Same for original_price. Idempotent: if a price is already within USD range
// (< 6000), it is left unchanged EXCEPT the $69 floor is still applied.
const path = require("path");
const { openDatabase } = require("../db-shim.js");

const MIN_USD = 69;
const MAX_USD = 5000;
const INR_PER_USD = 85;

function convertOne(priceInr) {
  if (priceInr == null) return priceInr;
  const n = Number(priceInr);
  if (!Number.isFinite(n) || n <= 0) return n;
  // Heuristic: anything >= 6000 is treated as INR and divided; otherwise left as USD.
  const asUsd = n >= 6000 ? Math.round(n / INR_PER_USD) : Math.round(n);
  return Math.max(MIN_USD, Math.min(MAX_USD, asUsd));
}

(async () => {
  const db = await openDatabase(path.join(__dirname, "..", "data", "store.db"));
  const rows = db.prepare("SELECT id, slug, name, price, original_price FROM products ORDER BY id").all();
  const update = db.prepare("UPDATE products SET price = ?, original_price = ? WHERE id = ?");
  let changed = 0;
  let minP = Infinity, maxP = -Infinity;
  for (const r of rows) {
    const newPrice = convertOne(r.price);
    let newOrig = convertOne(r.original_price);
    // Ensure original_price >= price (keep a visible discount). If the heuristic
    // collapsed both to the same floor, bump original_price by 10%.
    if (newOrig != null && newOrig <= newPrice) {
      newOrig = Math.min(MAX_USD, Math.round(newPrice * 1.15));
    }
    if (newPrice !== r.price || newOrig !== r.original_price) {
      update.run(newPrice, newOrig, r.id);
      changed++;
    }
    if (newPrice < minP) minP = newPrice;
    if (newPrice > maxP) maxP = newPrice;
  }
  db.save();
  db.close();
  console.log(`Repriced ${changed}/${rows.length} products. Final price range: $${minP} – $${maxP}`);
})();

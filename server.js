const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { DatabaseSync } = require("node:sqlite");
const crypto = require("crypto");
const { createDataLayer, verifyPassword, hashPassword } = require("./data-layer");
const { sendOtpEmail } = require("./mailer");

const PORT = 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "store.db");
const MONGODB_URI = process.env.MONGODB_URI || "";

fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
let dataLayer;
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL,
    original_price INTEGER NOT NULL,
    rating REAL NOT NULL,
    reviews INTEGER NOT NULL,
    stock INTEGER NOT NULL,
    image TEXT NOT NULL,
    images_json TEXT NOT NULL DEFAULT '[]',
    badge TEXT NOT NULL,
    description TEXT NOT NULL,
    specs_json TEXT NOT NULL,
    featured INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode TEXT NOT NULL,
    status TEXT NOT NULL,
    total INTEGER NOT NULL,
    items_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

ensureProductColumn("images_json", "TEXT NOT NULL DEFAULT '[]'");

seedProductsIfNeeded();

function ensureProductColumn(columnName, sqlType) {
  const columns = db.prepare("PRAGMA table_info(products)").all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE products ADD COLUMN ${columnName} ${sqlType}`);
  }
}

function seedProductsIfNeeded() {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  const hasPlaceholderNames = existing
    ? db.prepare("SELECT COUNT(*) AS count FROM products WHERE name LIKE 'ElectroHub %' OR brand = 'ElectroHub'").get().count > 0
    : false;
  const hasRemoteImages = existing
    ? db.prepare("SELECT COUNT(*) AS count FROM products WHERE image LIKE 'http%'").get().count > 0
    : false;

  if (existing >= 24 && !hasPlaceholderNames && !hasRemoteImages) {
    return;
  }

  db.exec("DELETE FROM products");

  const products = buildSeedProducts();
  const insert = db.prepare(`
    INSERT INTO products
    (slug, name, brand, category, price, original_price, rating, reviews, stock, image, images_json, badge, description, specs_json, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const product of products) {
    insert.run(
      product.slug,
      product.name,
      product.brand,
      product.category,
      product.price,
      product.originalPrice,
      product.rating,
      product.reviews,
      product.stock,
      product.images[0],
      JSON.stringify(product.images),
      product.badge,
      product.description,
      JSON.stringify(product.specs),
      product.featured ? 1 : 0
    );
  }
}

function buildSeedProducts() {
  const samsungPhoneImages = [
    "/public/assets/products/samsung-s24-ultra-1.png",
    "/public/assets/products/samsung-s24-ultra-2.png",
    "/public/assets/products/samsung-s24-ultra-3.png"
  ];
  const macbookImages = [
    "/public/assets/products/macbook-air-m3-1.png",
    "/public/assets/products/macbook-air-m3-2.png",
    "/public/assets/products/macbook-air-m3-3.png"
  ];
  const lenovoImages = [
    "/public/assets/products/lenovo-ideapad-slim-3-1.png",
    "/public/assets/products/lenovo-ideapad-slim-3-2.png",
    "/public/assets/products/lenovo-ideapad-slim-3-3.png"
  ];
  const sonyAudioImages = [
    "/public/assets/products/sony-wh1000xm5-1.png",
    "/public/assets/products/sony-wh1000xm5-2.png",
    "/public/assets/products/sony-wh1000xm5-3.png"
  ];
  const lgTvImages = [
    "/public/assets/products/lg-oled-c5-1.png",
    "/public/assets/products/lg-oled-c5-2.png",
    "/public/assets/products/lg-oled-c5-3.png"
  ];
  const samsungChargerImages = [
    "/public/assets/products/samsung-25w-charger-1.png",
    "/public/assets/products/samsung-25w-charger-2.png",
    "/public/assets/products/samsung-25w-charger-3.png"
  ];
  const philipsAirFryerImages = [
    "/public/assets/products/philips-airfryer-1.png",
    "/public/assets/products/philips-airfryer-2.png",
    "/public/assets/products/philips-airfryer-3.png"
  ];

  const families = [
    {
      category: "Mobiles",
      brand: "Samsung",
      badge: "Flagship 5G",
      images: samsungPhoneImages,
      baseSpecs: [
        "6.8-inch Dynamic AMOLED 2X display",
        "Snapdragon 8 Gen 3 processor",
        "200MP quad rear camera system",
        "5000mAh battery with USB-C charging",
        "IP68 water and dust resistance"
      ],
      description:
        "Samsung Galaxy S24 Ultra delivers flagship Android performance with a titanium frame, bright QHD+ display, Galaxy AI features, and versatile multi-zoom camera hardware designed for premium mobile photography and power users.",
      variants: [
        ["Samsung Galaxy S24 Ultra 5G (12GB RAM, 256GB, Titanium Gray)", 119999, 134999],
        ["Samsung Galaxy S24 Ultra 5G (12GB RAM, 512GB, Titanium Gray)", 129999, 144999],
        ["Samsung Galaxy S24 Ultra 5G (12GB RAM, 512GB, Titanium Black)", 129999, 144999],
        ["Samsung Galaxy S24 Ultra 5G (12GB RAM, 1TB, Titanium Gray)", 149999, 164999]
      ]
    },
    {
      category: "Laptops",
      brand: "Apple",
      badge: "Apple Silicon",
      images: macbookImages,
      baseSpecs: [
        "13.6-inch Liquid Retina display",
        "Apple M3 chip with unified memory",
        "Fast SSD storage",
        "Backlit keyboard with Touch ID",
        "Up to 18 hours battery life"
      ],
      description:
        "MacBook Air with M3 combines ultra-portable design with efficient Apple Silicon performance, a bright Liquid Retina display, silent fanless operation, and all-day battery life for work, study, and creative tasks.",
      variants: [
        ["Apple MacBook Air 2024 (13.6 inch, M3, 8GB, 256GB, macOS Sequoia, Midnight)", 85994, 104900],
        ["Apple MacBook Air 2024 (13.6 inch, M3, 8GB, 512GB, macOS Sequoia, Midnight)", 95994, 124900],
        ["Apple MacBook Air 2024 (13.6 inch, M3, 16GB, 256GB, macOS Sequoia, Midnight)", 105994, 134900],
        ["Apple MacBook Air 2024 (15.3 inch, M3, 16GB, 512GB, macOS Sequoia, Starlight)", 119994, 154900]
      ]
    },
    {
      category: "Laptops",
      brand: "Lenovo",
      badge: "Work & Study",
      images: lenovoImages,
      baseSpecs: [
        "15.3-inch WUXGA IPS display",
        "Intel Core i7 13th Gen processor",
        "DDR5 RAM and PCIe NVMe SSD",
        "Wi-Fi 6 and 1080p webcam",
        "Backlit keyboard and Dolby Audio"
      ],
      description:
        "Lenovo IdeaPad Slim 3 balances productivity performance, a modern 16:10 display, fast DDR5 memory, and practical connectivity for office work, online classes, and everyday multitasking.",
      variants: [
        ["Lenovo IdeaPad Slim 3 15IRH10 (16GB, 512GB SSD, Windows 11 Home, Luna Grey)", 75990, 81999],
        ["Lenovo IdeaPad Slim 3 15IRH10 (16GB, 1TB SSD, Windows 11 Home, Luna Grey)", 82990, 89999],
        ["Lenovo IdeaPad Slim 3 15IRH10 (24GB, 512GB SSD, Windows 11 Home, Luna Grey)", 79990, 86999],
        ["Lenovo IdeaPad Slim 3 15IRH10 (16GB, 512GB SSD, MS Office Home 2024, Luna Grey)", 78990, 84999]
      ]
    },
    {
      category: "Audio",
      brand: "Sony",
      badge: "Premium ANC",
      images: sonyAudioImages,
      baseSpecs: [
        "Adaptive active noise cancellation",
        "Bluetooth 5.2 connectivity",
        "Up to 40 hours battery life",
        "8 microphones with QN1 processor",
        "Multipoint pairing and voice assistant support"
      ],
      description:
        "Sony WH-1000XM5 headphones are built for premium everyday listening with top-tier adaptive ANC, clear voice pickup, long battery life, and refined tuning for travel, calls, and focused work.",
      variants: [
        ["Sony WH-1000XM5 Bluetooth Headset with Mic (Silver)", 24990, 29990],
        ["Sony WH-1000XM5 Bluetooth Headset with Mic (Black)", 24990, 29990],
        ["Sony WH-1000XM5 Bluetooth Headset with Mic (Silver, Travel Bundle)", 25990, 31990],
        ["Sony WH-1000XM5 Bluetooth Headset with Mic (Black, Extended Warranty Pack)", 26490, 32490]
      ]
    },
    {
      category: "TVs",
      brand: "LG",
      badge: "OLED 4K",
      images: lgTvImages,
      baseSpecs: [
        "OLED 4K Ultra HD panel",
        "120Hz refresh rate",
        "webOS smart TV platform",
        "Dolby Vision and Dolby Atmos",
        "AI picture processing with gaming features"
      ],
      description:
        "LG evo AI C5 OLED TV delivers deep blacks, vivid OLED colour, premium 4K upscaling, smart streaming apps, and responsive gaming features including high refresh support and advanced AI picture tuning.",
      variants: [
        ["LG evo AI C5 106 cm (42 inch) OLED 4K Ultra HD Smart WebOS TV", 129990, 149990],
        ["LG evo AI C5 139.7 cm (55 inch) OLED 4K Ultra HD Smart WebOS TV", 170799, 247090],
        ["LG evo AI C5 165.1 cm (65 inch) OLED 4K Ultra HD Smart WebOS TV", 244199, 387190],
        ["LG evo AI C5 195 cm (77 inch) OLED 4K Ultra HD Smart WebOS TV", 419399, 580790]
      ]
    },
    {
      category: "Accessories",
      brand: "Samsung",
      badge: "Fast Charging",
      images: samsungChargerImages,
      baseSpecs: [
        "25W USB-C fast charging",
        "PD 3.0 and PPS support",
        "Compact wall adapter design",
        "Optimised for Galaxy devices",
        "Low standby power consumption"
      ],
      description:
        "Samsung 25W Type-C charger is a compact fast-charging adapter designed for compatible Galaxy phones and other USB-C devices, offering efficient PD and PPS charging in a travel-friendly form.",
      variants: [
        ["Samsung 25W Type-C Fast Charger (Adapter Only, Black)", 1399, 1699],
        ["Samsung 25W Type-C Fast Charger (Adapter Only, White)", 1399, 1699],
        ["Samsung EP-T2510XWNGIN 25W Type-C Fast Charger (Cable Included, White)", 2099, 2299],
        ["Samsung 45W Type-C Super Fast Charger (Adapter Only, Black)", 2999, 3499]
      ]
    },
    {
      category: "Appliances",
      brand: "Philips",
      badge: "Healthy Cooking",
      images: philipsAirFryerImages,
      baseSpecs: [
        "Rapid Air technology",
        "4.2-litre cooking basket",
        "1500W heating performance",
        "Fry, roast, grill, and bake",
        "Low-oil cooking and easy-clean design"
      ],
      description:
        "Philips 1000 Series air fryer uses Rapid Air technology to circulate hot air evenly for crisp cooking with significantly less oil, making it ideal for quick family meals and healthier everyday preparation.",
      variants: [
        ["Philips 1000 Series 4.2L 1500W Air Fryer (Black)", 6999, 8999],
        ["Philips 2000 Series 4.2L 1500W Digital Air Fryer (Black)", 8999, 10999],
        ["Philips 1000 Series 4.2L 1500W Air Fryer (Black, 12 Presets)", 7499, 9499],
        ["Philips 2000 Series 4.2L 1500W Digital Air Fryer (Black, Touch Panel)", 9499, 11499]
      ]
    }
  ];

  const products = [];
  let index = 0;
  for (const family of families) {
    for (const [name, price, originalPrice] of family.variants) {
      index += 1;
      products.push({
        slug: slugify(name),
        name,
        brand: family.brand,
        category: family.category,
        price,
        originalPrice,
        rating: Number((4.1 + (index % 6) * 0.15).toFixed(1)),
        reviews: 48 + index * 21,
        stock: 5 + (index % 18),
        images: family.images,
        badge: family.badge,
        description: family.description,
        specs: family.baseSpecs,
        featured: index <= 12
      });
    }
  }

  return products;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function currency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getCategories() {
  return db.prepare("SELECT category, COUNT(*) AS count FROM products GROUP BY category ORDER BY category").all();
}

function getFeaturedProducts(limit = 8) {
  return db.prepare("SELECT * FROM products WHERE featured = 1 ORDER BY id LIMIT ?").all(limit).map(normalizeProduct);
}

function normalizeProduct(product) {
  const images = product.images_json ? JSON.parse(product.images_json) : product.image ? [product.image] : [];
  const color = extractColorLabel(product.name);
  const familyKey = buildFamilyKey(product.name);
  const memory = extractMemoryLabel(product.name);
  return {
    ...product,
    images,
    image: images[0] || product.image,
    specs: product.specs_json ? JSON.parse(product.specs_json) : [],
    color,
    memory,
    familyKey
  };
}

function extractColorLabel(name) {
  const labels = ["Midnight", "Starlight", "Titanium Gray", "Titanium Black", "Black", "White", "Silver", "Luna Grey"];
  return labels.find((label) => name.includes(label)) || "";
}

function extractMemoryLabel(name) {
  const match = name.match(/(\d+GB|\d+TB)(?=,|\))/i);
  return match ? match[1].toUpperCase() : "";
}

function buildFamilyKey(name) {
  return name.replace(/\s*\(.+$/, "").trim().toLowerCase();
}

function uniqueProductsByFamily(products) {
  const map = new Map();
  for (const product of products) {
    if (!map.has(product.familyKey)) {
      map.set(product.familyKey, product);
    }
  }
  return Array.from(map.values());
}

function getFamilyVariants(product) {
  return db
    .prepare("SELECT * FROM products WHERE brand = ? AND category = ?")
    .all(product.brand, product.category)
    .map(normalizeProduct)
    .filter((item) => item.familyKey === product.familyKey);
}

function imageToneClass(product) {
  const color = (product.color || "").toLowerCase();
  if (color.includes("starlight")) return "tone-starlight";
  if (color.includes("silver")) return "tone-silver";
  if (color.includes("titanium gray") || color.includes("luna grey")) return "tone-gray";
  return "";
}

function nav(currentPath) {
  const links = [
    ["/", "Home"],
    ["/products", "Products"],
    ["/cart", "Cart"],
    ["/track", "Track Order"],
    ["/admin", "Admin"]
  ];

  return links.map(([href, label]) => {
    const active = currentPath === href ? "active" : "";
    return `<a class="${active}" href="${href}">${label}</a>`;
  }).join("");
}

function layout({ title, description = "", currentPath = "/", content, user = null }) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description || title)}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/public/app.css">
  </head>
  <body>
    <div class="shell">
      <header class="site-header">
        <a class="brand" href="/">
          <span class="brand-word">electrohub</span>
        </a>
        <a class="menu-link" href="/products">☰ <span>Menu</span></a>
        <div class="header-tools">
          <form class="search-inline" action="/products" method="GET">
            <input type="search" name="q" placeholder="What are you looking for ?">
          </form>
          <div class="header-meta">
            <span class="location-pill">📍 Mumbai, 400049</span>
            ${user
              ? `<a class="account-link" href="/account">${escapeHtml(user.name.split(" ")[0])}</a>`
              : `<a class="account-link" href="/auth">👤</a>`}
            <a class="cart-pill" href="/cart">🛒 <span data-cart-count>0</span></a>
          </div>
        </div>
      </header>
      <div class="sub-nav"><nav class="main-nav">${nav(currentPath)}</nav></div>
      <div class="category-rail">
        ${getCategories().map((item) => `<a href="/category/${slugify(item.category)}">${escapeHtml(item.category)}</a>`).join("")}
      </div>
      ${content}
      <footer class="site-footer">
        <div class="footer-inner">
          <div class="footer-brand">
            <span class="brand-word">electrohub</span>
            <p>Your trusted destination for electronics, gadgets, and everyday tech.</p>
          </div>
          <div class="footer-col">
            <h4>Shop</h4>
            <a href="/products">All Products</a>
            <a href="/category/mobiles">Mobiles</a>
            <a href="/category/laptops">Laptops</a>
            <a href="/category/audio">Audio</a>
            <a href="/category/tvs">TVs</a>
            <a href="/category/accessories">Accessories</a>
          </div>
          <div class="footer-col">
            <h4>Account</h4>
            ${user
              ? `<a href="/account">My Account</a>`
              : `<a href="/auth">Sign In / Register</a>`}
            <a href="/account">My Orders</a>
            <a href="/track">Track Order</a>
            <a href="/cart">Cart</a>
            ${user ? `<form action="/auth/logout" method="POST" style="margin:0"><button style="background:none;padding:0;color:var(--muted);font-size:0.88rem;font-weight:600;cursor:pointer;font-family:inherit">Sign Out</button></form>` : ""}
          </div>
        </div>
        <div class="footer-bottom">
          <span>© 2025 ElectroHub. All rights reserved.</span>
          <span>Built for modern shoppers.</span>
        </div>
      </footer>
    </div>
    <script src="/public/app.js"></script>
  </body>
  </html>`;
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw.split(";").reduce((acc, item) => {
    const [key, ...rest] = item.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

async function getCurrentUser(req) {
  const cookies = parseCookies(req);
  if (!cookies.session_token || !dataLayer) return null;
  const session = await dataLayer.getSession(cookies.session_token);
  return session?.user || null;
}

function setSessionCookie(res, token, expiresAt) {
  res.setHeader("Set-Cookie", `session_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "session_token=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
}

function isAdmin(user) {
  return Boolean(user && user.email === "admin@electrohub.local");
}

function getOrdersByEmail(email) {
  return db.prepare("SELECT * FROM orders WHERE email = ? ORDER BY id DESC").all(email.toLowerCase());
}

function parseListField(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function productCard(product) {
  const secondaryImage = product.images[1] || product.images[0] || product.image;
  const familyVariants = getFamilyVariants(product);
  const memories = [...new Set(familyVariants.map((item) => item.memory).filter(Boolean))];
  const colors = [...new Set(familyVariants.map((item) => item.color).filter(Boolean))];
  return `
    <article class="product-card">
      <a class="product-link" href="/product/${product.slug}">
        <div class="card-media">
          <img class="primary-image ${imageToneClass(product)}" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
          <img class="secondary-image ${imageToneClass(product)}" src="${escapeHtml(secondaryImage)}" alt="${escapeHtml(product.name)} alternate view">
          <span class="image-count">${product.images.length} views</span>
        </div>
      </a>
      <div class="product-body">
        <span class="badge">${escapeHtml(product.badge)}</span>
        <h3><a href="/product/${product.slug}">${escapeHtml(product.name)}</a></h3>
        <p class="product-brand">${escapeHtml(product.brand)} · ${escapeHtml(product.category)}</p>
        ${product.color ? `<div class="color-chip">${escapeHtml(product.color)}</div>` : ""}
        ${memories.length ? `<div class="variant-row">${memories.slice(0, 4).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        ${colors.length ? `<div class="variant-row muted-row">${colors.slice(0, 4).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        <div class="rating-row">
          <span class="rating-chip">${product.rating} ★</span>
          <span>${product.reviews.toLocaleString("en-IN")} reviews</span>
        </div>
        <div class="price-row">
          <strong>${currency(product.price)}</strong>
          <del>${currency(product.original_price || product.originalPrice)}</del>
        </div>
        <p class="stock ${product.stock < 10 ? "low" : ""}">${product.stock} units in stock</p>
        <div class="card-actions">
          <a class="ghost-button" href="/product/${product.slug}">View details</a>
          <button class="primary-button" data-add-to-cart='${JSON.stringify({
            id: product.id,
            slug: product.slug,
            name: product.name,
            price: product.price,
            image: product.image
          }).replace(/'/g, "&apos;")}'>Add to cart</button>
        </div>
      </div>
    </article>
  `;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function legacyHomePage(user = null) {
  const categories = getCategories();
  const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  const featured = uniqueProductsByFamily(getFeaturedProducts(12)).slice(0, 8);
  const latest = uniqueProductsByFamily(db.prepare("SELECT * FROM products ORDER BY id DESC LIMIT 20").all().map(normalizeProduct)).slice(0, 12);
  const audio = uniqueProductsByFamily(db.prepare("SELECT * FROM products WHERE category = 'Audio' ORDER BY reviews DESC LIMIT 8").all().map(normalizeProduct)).slice(0, 4);
  const mobiles = uniqueProductsByFamily(db.prepare("SELECT * FROM products WHERE category = 'Mobiles' ORDER BY reviews DESC LIMIT 8").all().map(normalizeProduct)).slice(0, 4);
  const slideProducts = [
    featured[0],
    featured[1] || latest[0] || featured[0],
    featured[2] || mobiles[0] || featured[0],
    featured[3] || audio[0] || featured[0],
    latest[0] || featured[4] || featured[0],
    latest[1] || featured[5] || featured[0],
    audio[0] || featured[6] || featured[0],
    mobiles[0] || featured[7] || featured[0]
  ].filter(Boolean);
  const slides = [
    {
      eyebrow: slideProducts[0]?.brand || "GoPro",
      title: "Sports & action cameras",
      priceLine: `Starting at ${currency(slideProducts[0]?.price || 23900)}`,
      note: "Inclusive of all offers",
      image: slideProducts[0]?.image || "/assets/products/macbook-air-m3-1.png",
      href: slideProducts[0] ? `/product/${slideProducts[0].slug}` : "/products",
      palette: "graphite"
    },
    {
      eyebrow: slideProducts[1]?.brand || "Apple",
      title: "Ultra-light laptops for work and play",
      priceLine: `From ${currency(slideProducts[1]?.price || 85994)}`,
      note: "Thin, powerful, and ready to ship",
      image: slideProducts[1]?.image || "/assets/products/macbook-air-m3-1.png",
      href: slideProducts[1] ? `/product/${slideProducts[1].slug}` : "/products",
      palette: "ocean"
    },
    {
      eyebrow: slideProducts[2]?.brand || "Samsung",
      title: "Smartphones built for speed and cameras",
      priceLine: `Deals from ${currency(slideProducts[2]?.price || 29999)}`,
      note: "Exchange bonus and bank offers available",
      image: slideProducts[2]?.image || "/assets/products/macbook-air-m3-2.png",
      href: slideProducts[2] ? `/product/${slideProducts[2].slug}` : "/products",
      palette: "violet"
    },
    {
      eyebrow: slideProducts[3]?.brand || "Sony",
      title: "Cinema sound and immersive home audio",
      priceLine: `Starting at ${currency(slideProducts[3]?.price || 14999)}`,
      note: "Premium picks for music, movies, and gaming",
      image: slideProducts[3]?.image || "/assets/products/macbook-air-m3-3.png",
      href: slideProducts[3] ? `/product/${slideProducts[3].slug}` : "/products",
      palette: "graphite"
    },
    {
      eyebrow: slideProducts[4]?.brand || "Lenovo",
      title: "Performance laptops for campus and office",
      priceLine: `Shop from ${currency(slideProducts[4]?.price || 55990)}`,
      note: "Fast SSDs, higher RAM, and modern displays",
      image: slideProducts[4]?.image || "/assets/products/macbook-air-m3-1.png",
      href: slideProducts[4] ? `/product/${slideProducts[4].slug}` : "/products",
      palette: "ocean"
    },
    {
      eyebrow: slideProducts[5]?.brand || "LG",
      title: "Big-screen entertainment for every room",
      priceLine: `Offers from ${currency(slideProducts[5]?.price || 27990)}`,
      note: "4K smart TVs and living-room upgrades",
      image: slideProducts[5]?.image || "/assets/products/macbook-air-m3-2.png",
      href: slideProducts[5] ? `/product/${slideProducts[5].slug}` : "/products",
      palette: "violet"
    },
    {
      eyebrow: slideProducts[6]?.brand || "Sony",
      title: "Headphones and earbuds with all-day comfort",
      priceLine: `Starting at ${currency(slideProducts[6]?.price || 1499)}`,
      note: "ANC, long battery life, and richer sound",
      image: slideProducts[6]?.image || "/assets/products/macbook-air-m3-3.png",
      href: slideProducts[6] ? `/product/${slideProducts[6].slug}` : "/products",
      palette: "graphite"
    },
    {
      eyebrow: slideProducts[7]?.brand || "Samsung",
      title: "Flagship phones with bigger memory options",
      priceLine: `From ${currency(slideProducts[7]?.price || 17999)}`,
      note: "Choose higher storage and color variants easily",
      image: slideProducts[7]?.image || "/assets/products/macbook-air-m3-2.png",
      href: slideProducts[7] ? `/product/${slideProducts[7].slug}` : "/products",
      palette: "ocean"
    }
  ];
  const brands = ["Samsung", "Sony", "LG", "HP", "Lenovo", "Boat", "Apple", "Acer"];
  const promises = [
    ["Genuine products", "Only verified electronics and accessories"],
    ["Fast support", "Order help, service plans, and tracking"],
    ["Easy finance", "EMI and card-offer style checkout flow"],
    ["Store scale", "Multi-category shopping from one storefront"]
  ];
  const dealsOfDay = [
    {
      title: "Laptops for every desk",
      subtitle: "Productivity, creators, and campus-ready picks",
      price: "Starting at ₹49,990",
      href: "/category/laptops",
      image: featured[0]?.image || "/assets/products/macbook-air-m3-1.png"
    },
    {
      title: "True wireless audio",
      subtitle: "Earbuds and speakers with all-day battery",
      price: "Starting at ₹1,499",
      href: "/category/audio",
      image: audio[0]?.image || featured[1]?.image || "/assets/products/macbook-air-m3-2.png"
    },
    {
      title: "Smartphones with flagship chips",
      subtitle: "Higher RAM and storage options available",
      price: "Starting at ₹17,999",
      href: "/category/mobiles",
      image: mobiles[0]?.image || featured[2]?.image || "/assets/products/macbook-air-m3-3.png"
    },
    {
      title: "4K TVs and smart entertainment",
      subtitle: "Cinema-style viewing for modern living rooms",
      price: "Starting at ₹27,990",
      href: "/category/tvs",
      image: featured[3]?.image || featured[0]?.image || "/assets/products/macbook-air-m3-1.png"
    }
  ];

  const allProducts = db.prepare("SELECT * FROM products ORDER BY featured DESC, reviews DESC, id ASC").all().map(normalizeProduct);
  const uniqueAllProducts = uniqueProductsByFamily(allProducts);
  const pickProduct = (brand, category) => (
    uniqueAllProducts.find((product) => product.brand === brand && product.category === category) || uniqueAllProducts[0]
  );
  const samsungMobile = pickProduct("Samsung", "Mobiles");
  const appleLaptop = pickProduct("Apple", "Laptops");
  const lenovoLaptop = pickProduct("Lenovo", "Laptops");
  const sonyAudio = pickProduct("Sony", "Audio");
  const lgTv = pickProduct("LG", "TVs");
  const samsungCharger = pickProduct("Samsung", "Accessories");
  const philipsAppliance = pickProduct("Philips", "Appliances");
  const whatsHot = [
    {
      kicker: samsungMobile?.brand || "Samsung",
      title: "Galaxy S24 Ultra 5G",
      subtitle: "Flagship camera phone with memory upgrades",
      price: currency(samsungMobile?.price || 119999),
      originalPrice: currency(samsungMobile?.originalPrice || 134999),
      note: "Inclusive of all offers",
      href: samsungMobile ? `/product/${samsungMobile.slug}` : "/products",
      image: samsungMobile?.image || "/public/assets/products/samsung-s24-ultra-1.png"
    },
    {
      kicker: appleLaptop?.brand || "Apple",
      title: "MacBook Air M3",
      subtitle: "Lightweight laptop for work, campus, and travel",
      price: currency(appleLaptop?.price || 85994),
      originalPrice: currency(appleLaptop?.originalPrice || 104900),
      note: "Thin design with all-day battery life",
      href: appleLaptop ? `/product/${appleLaptop.slug}` : "/products",
      image: appleLaptop?.image || "/public/assets/products/macbook-air-m3-1.png"
    },
    {
      kicker: lgTv?.brand || "LG",
      title: "OLED 4K Smart TV",
      subtitle: "Deep blacks, Dolby support, and gaming features",
      price: currency(lgTv?.price || 129990),
      originalPrice: currency(lgTv?.originalPrice || 149990),
      note: "Cinema-style viewing at home",
      href: lgTv ? `/product/${lgTv.slug}` : "/products",
      image: lgTv?.image || "/public/assets/products/lg-oled-c5-1.png"
    },
    {
      kicker: philipsAppliance?.brand || "Philips",
      title: "Air Fryer Series",
      subtitle: "Crisp cooking with less oil for everyday meals",
      price: currency(philipsAppliance?.price || 6999),
      originalPrice: currency(philipsAppliance?.originalPrice || 8999),
      note: "Healthy cooking and easy-clean basket design",
      href: philipsAppliance ? `/product/${philipsAppliance.slug}` : "/products",
      image: philipsAppliance?.image || "/public/assets/products/philips-airfryer-1.png"
    }
  ];
  slides.splice(0, slides.length,
    {
      eyebrow: samsungMobile?.brand || "Samsung",
      title: "Galaxy S24 Ultra with flagship camera power",
      priceLine: `Starting at ${currency(samsungMobile?.price || 119999)}`,
      note: "Galaxy AI, titanium finish, and premium memory options",
      image: samsungMobile?.image || "/public/assets/products/samsung-s24-ultra-1.png",
      href: samsungMobile ? `/product/${samsungMobile.slug}` : "/products",
      palette: "graphite"
    },
    {
      eyebrow: appleLaptop?.brand || "Apple",
      title: "MacBook Air built for all-day work and study",
      priceLine: `From ${currency(appleLaptop?.price || 85994)}`,
      note: "Apple Silicon performance with a thin, silent design",
      image: appleLaptop?.image || "/public/assets/products/macbook-air-m3-1.png",
      href: appleLaptop ? `/product/${appleLaptop.slug}` : "/products",
      palette: "ocean"
    },
    {
      eyebrow: lenovoLaptop?.brand || "Lenovo",
      title: "Performance laptops for office, campus, and home",
      priceLine: `Deals from ${currency(lenovoLaptop?.price || 75990)}`,
      note: "Fast SSD storage, higher RAM, and modern displays",
      image: lenovoLaptop?.image || "/public/assets/products/lenovo-ideapad-slim-3-1.png",
      href: lenovoLaptop ? `/product/${lenovoLaptop.slug}` : "/products",
      palette: "violet"
    },
    {
      eyebrow: lgTv?.brand || "LG",
      title: "4K OLED TVs for cinematic living-room viewing",
      priceLine: `Starting at ${currency(lgTv?.price || 129990)}`,
      note: "OLED picture quality, Dolby support, and gaming-ready refresh rates",
      image: lgTv?.image || "/public/assets/products/lg-oled-c5-1.png",
      href: lgTv ? `/product/${lgTv.slug}` : "/products",
      palette: "graphite"
    },
    {
      eyebrow: sonyAudio?.brand || "Sony",
      title: "Premium wireless headphones with adaptive ANC",
      priceLine: `Shop from ${currency(sonyAudio?.price || 24990)}`,
      note: "Comfort, long battery life, and clearer calls on the go",
      image: sonyAudio?.image || "/public/assets/products/sony-wh1000xm5-1.png",
      href: sonyAudio ? `/product/${sonyAudio.slug}` : "/products",
      palette: "ocean"
    },
    {
      eyebrow: philipsAppliance?.brand || "Philips",
      title: "Air fryers for quick and healthier everyday meals",
      priceLine: `Offers from ${currency(philipsAppliance?.price || 6999)}`,
      note: "Rapid Air technology with family-friendly basket sizes",
      image: philipsAppliance?.image || "/public/assets/products/philips-airfryer-1.png",
      href: philipsAppliance ? `/product/${philipsAppliance.slug}` : "/products",
      palette: "violet"
    },
    {
      eyebrow: samsungCharger?.brand || "Samsung",
      title: "Fast chargers and everyday accessories that travel well",
      priceLine: `Starting at ${currency(samsungCharger?.price || 1399)}`,
      note: "Compact USB-C charging for phones, tablets, and more",
      image: samsungCharger?.image || "/public/assets/products/samsung-25w-charger-1.png",
      href: samsungCharger ? `/product/${samsungCharger.slug}` : "/products",
      palette: "graphite"
    },
    {
      eyebrow: samsungMobile?.brand || "Samsung",
      title: "Flagship phones with higher memory and storage options",
      priceLine: `From ${currency(samsungMobile?.price || 119999)}`,
      note: "Compare 256GB, 512GB, and 1TB variants on the product page",
      image: samsungMobile?.images?.[1] || samsungMobile?.image || "/public/assets/products/samsung-s24-ultra-2.png",
      href: samsungMobile ? `/product/${samsungMobile.slug}` : "/products",
      palette: "ocean"
    }
  );
  dealsOfDay.splice(0, dealsOfDay.length,
    {
      kicker: lenovoLaptop?.brand || "Lenovo",
      title: "IdeaPad Slim 3",
      subtitle: "Productivity laptop with SSD storage and DDR5 memory",
      price: `Starting at ${currency(lenovoLaptop?.price || 75990)}`,
      note: "Exchange bonus and bank offers available",
      href: lenovoLaptop ? `/product/${lenovoLaptop.slug}` : "/products",
      image: lenovoLaptop?.image || "/public/assets/products/lenovo-ideapad-slim-3-1.png"
    },
    {
      kicker: sonyAudio?.brand || "Sony",
      title: "WH-1000XM5 Headphones",
      subtitle: "Premium adaptive ANC and long battery life",
      price: `Starting at ${currency(sonyAudio?.price || 24990)}`,
      note: "Comfortable listening for work, travel, and calls",
      href: sonyAudio ? `/product/${sonyAudio.slug}` : "/products",
      image: sonyAudio?.image || "/public/assets/products/sony-wh1000xm5-1.png"
    },
    {
      kicker: samsungCharger?.brand || "Samsung",
      title: "25W Type-C Fast Charger",
      subtitle: "Compact PD charging for phones and tablets",
      price: `Starting at ${currency(samsungCharger?.price || 1399)}`,
      note: "Travel-ready design with fast USB-C output",
      href: samsungCharger ? `/product/${samsungCharger.slug}` : "/products",
      image: samsungCharger?.image || "/public/assets/products/samsung-25w-charger-1.png"
    },
    {
      kicker: samsungMobile?.brand || "Samsung",
      title: "Galaxy S24 Ultra Variants",
      subtitle: "Compare memory size and premium color options",
      price: `Starting at ${currency(samsungMobile?.price || 119999)}`,
      note: "256GB, 512GB, and 1TB options available",
      href: samsungMobile ? `/product/${samsungMobile.slug}` : "/products",
      image: samsungMobile?.images?.[1] || samsungMobile?.image || "/public/assets/products/samsung-s24-ultra-2.png"
    }
  );

  return layout({
    title: "ElectroHub | Electronics",
    description: "Multi-page electronics website with 50+ products, shopping cart, checkout, and order tracking.",
    currentPath: "/",
    user,
    content: `
      <main>
        <section class="hero-carousel" data-carousel>
          <div class="carousel-viewport">
            ${slides.map((slide, index) => `
              <article class="carousel-slide ${index === 0 ? "active" : ""}" data-carousel-slide data-tone="${slide.palette}">
                <div class="carousel-overlay"></div>
                <div class="carousel-content">
                  <span class="carousel-brand">${escapeHtml(slide.eyebrow)}</span>
                  <h1>${escapeHtml(slide.title)}</h1>
                  <p class="carousel-price">${escapeHtml(slide.priceLine)}</p>
                  <p class="carousel-note">${escapeHtml(slide.note)}</p>
                  <div class="hero-actions">
                    <a class="shop-now-button" href="${slide.href}">Shop now</a>
                    <a class="ghost-button light" href="/products">View all products</a>
                  </div>
                </div>
                <div class="carousel-art">
                  <img src="${slide.image}" alt="${escapeHtml(slide.title)}">
                </div>
              </article>
            `).join("")}
            <button class="carousel-arrow prev" type="button" aria-label="Previous slide" data-carousel-prev>&lsaquo;</button>
            <button class="carousel-arrow next" type="button" aria-label="Next slide" data-carousel-next>&rsaquo;</button>
          </div>
          <div class="carousel-dots">
            ${slides.map((slide, index) => `
              <button class="carousel-dot ${index === 0 ? "active" : ""}" type="button" aria-label="Go to slide ${index + 1}" data-carousel-dot="${index}"></button>
            `).join("")}
          </div>
        </section>

        <section class="service-strip">
          ${promises.map(([title, text]) => `
            <article class="service-tile">
              <strong>${title}</strong>
              <span>${text}</span>
            </article>
          `).join("")}
        </section>

        <section class="section dark-section hot-section">
          <div class="section-head light">
            <div>
              <p class="eyebrow">What's hot</p>
              <h2>Featured products with matching visuals and offers</h2>
            </div>
          </div>
          <div class="hot-grid">
            ${whatsHot.map((item) => `
              <a class="hot-tile" href="${item.href}">
                <span class="hot-kicker">${escapeHtml(item.kicker)}</span>
                <strong>${escapeHtml(item.title)}</strong>
                <span class="hot-subtitle">${escapeHtml(item.subtitle)}</span>
                <img src="${item.image}" alt="${escapeHtml(item.title)}">
                <div class="hot-price-row">
                  <del>${escapeHtml(item.originalPrice)}</del>
                  <b>${escapeHtml(item.price)}</b>
                </div>
                <p>${escapeHtml(item.note)}</p>
              </a>
            `).join("")}
          </div>
        </section>

        <section class="section dark-section">
          <div class="section-head light">
            <div>
              <p class="eyebrow">Deals of the day</p>
              <h2>Curated daily picks using the right product visuals</h2>
            </div>
            <a class="text-link light" href="/products">Shop all offers</a>
          </div>
          <div class="deal-grid">
            ${dealsOfDay.map((deal) => `
              <a class="deal-tile" href="${deal.href}">
                <div class="deal-copy">
                  <small>${escapeHtml(deal.kicker || "")}</small>
                  <strong>${escapeHtml(deal.title)}</strong>
                  <span>${escapeHtml(deal.subtitle)}</span>
                </div>
                <img src="${deal.image}" alt="${escapeHtml(deal.title)}">
                <p>${escapeHtml(deal.price)}</p>
                <em>${escapeHtml(deal.note || "")}</em>
              </a>
            `).join("")}
          </div>
        </section>

        <section class="section section-showcase category-showcase">
          <div class="section-head">
            <div>
              <p class="eyebrow">Categories</p>
              <h2>Shop by category</h2>
            </div>
          </div>
          <div class="category-grid">
            ${categories.map((item) => `
              <a class="category-card" href="/category/${slugify(item.category)}">
                <span>${escapeHtml(item.category)}</span>
                <strong>${item.count} products</strong>
              </a>
            `).join("")}
          </div>
        </section>

        <section class="section section-showcase brand-showcase">
          <div class="section-head">
            <div>
              <p class="eyebrow">Shop by brand</p>
              <h2>Popular brands customers look for</h2>
            </div>
          </div>
          <div class="brand-grid">
            ${brands.map((brand) => `
              <article class="brand-tile">
                <strong>${brand}</strong>
                <span>Top electronics offers</span>
              </article>
            `).join("")}
          </div>
        </section>

        <section class="section section-showcase featured-showcase">
          <div class="section-head">
            <div>
              <p class="eyebrow">Exciting deals</p>
              <h2>Best-selling electronics</h2>
            </div>
            <a class="text-link" href="/products">View complete catalog</a>
          </div>
          <div class="product-grid">
            ${featured.map(productCard).join("")}
          </div>
        </section>

        <section class="section promo-band promo-band-dark">
          <div class="band-copy">
            <p class="eyebrow">Audio zone</p>
            <h2>Soundbars, earbuds, headphones, and speakers for every setup</h2>
            <p class="subtle">A dedicated shopping band similar to large electronics-store merchandising, focused on one category at a time.</p>
            <a class="primary-button" href="/category/audio">Explore audio deals</a>
          </div>
          <div class="mini-grid">
            ${audio.map(productCard).join("")}
          </div>
        </section>

        <section class="section promo-band promo-band-dark reverse">
          <div class="band-copy">
            <p class="eyebrow">Mobile store</p>
            <h2>Trending 5G smartphones, launch offers, and exchange-ready picks</h2>
            <p class="subtle">A denser category-led layout so your homepage feels like a full electronics retail destination.</p>
            <a class="primary-button" href="/category/mobiles">Explore mobiles</a>
          </div>
          <div class="mini-grid">
            ${mobiles.map(productCard).join("")}
          </div>
        </section>

        <section class="highlight-band">
          <div>
            <p class="eyebrow">Live catalog</p>
            <h2>${productCount}+ products ready across popular categories</h2>
            <p class="subtle">Browse laptops, phones, TVs, wearables, and accessories from one responsive storefront built for desktop, tablet, and mobile.</p>
          </div>
          <div class="highlight-actions">
            <a class="primary-button" href="/products">Explore catalog</a>
            <a class="ghost-button" href="/admin">Admin panel</a>
          </div>
        </section>

        <section class="section section-showcase latest-showcase">
          <div class="section-head">
            <div>
              <p class="eyebrow">Just landed</p>
              <h2>Latest arrivals</h2>
            </div>
          </div>
          <div class="product-grid compact-grid">
            ${latest.map(productCard).join("")}
          </div>
        </section>
      </main>
    `
  });
}

function homePage(user = null) {
  const categories = getCategories();
  const allProducts = db.prepare("SELECT * FROM products ORDER BY featured DESC, reviews DESC, id ASC").all().map(normalizeProduct);
  const uniqueAllProducts = uniqueProductsByFamily(allProducts);
  const pickProduct = (brand, category) => (
    uniqueAllProducts.find((product) => product.brand === brand && product.category === category) || uniqueAllProducts[0]
  );

  const samsungMobile = pickProduct("Samsung", "Mobiles");
  const appleLaptop = pickProduct("Apple", "Laptops");
  const lenovoLaptop = pickProduct("Lenovo", "Laptops");
  const sonyAudio = pickProduct("Sony", "Audio");
  const lgTv = pickProduct("LG", "TVs");
  const samsungCharger = pickProduct("Samsung", "Accessories");
  const philipsAppliance = pickProduct("Philips", "Appliances");

  const heroSlides = [
    {
      eyebrow: samsungMobile?.brand || "Samsung",
      title: "Galaxy S24 Ultra with flagship camera power",
      priceLine: `Starting at ${currency(samsungMobile?.price || 119999)}`,
      note: "Galaxy AI, titanium finish, and premium memory options",
      image: samsungMobile?.image || "/public/assets/products/samsung-s24-ultra-1.png",
      href: samsungMobile ? `/product/${samsungMobile.slug}` : "/products",
      palette: "graphite"
    },
    {
      eyebrow: appleLaptop?.brand || "Apple",
      title: "MacBook Air built for all-day work and study",
      priceLine: `From ${currency(appleLaptop?.price || 85994)}`,
      note: "Apple Silicon performance with a thin, silent design",
      image: appleLaptop?.image || "/public/assets/products/macbook-air-m3-1.png",
      href: appleLaptop ? `/product/${appleLaptop.slug}` : "/products",
      palette: "ocean"
    },
    {
      eyebrow: lgTv?.brand || "LG",
      title: "4K OLED TVs for cinematic living-room viewing",
      priceLine: `Starting at ${currency(lgTv?.price || 129990)}`,
      note: "OLED picture quality, Dolby support, and gaming-ready refresh rates",
      image: lgTv?.image || "/public/assets/products/lg-oled-c5-1.png",
      href: lgTv ? `/product/${lgTv.slug}` : "/products",
      palette: "violet"
    },
    {
      eyebrow: sonyAudio?.brand || "Sony",
      title: "Premium wireless headphones with adaptive ANC",
      priceLine: `Shop from ${currency(sonyAudio?.price || 24990)}`,
      note: "Comfort, long battery life, and clearer calls on the go",
      image: sonyAudio?.image || "/public/assets/products/sony-wh1000xm5-1.png",
      href: sonyAudio ? `/product/${sonyAudio.slug}` : "/products",
      palette: "graphite"
    }
  ];

  const categoryIcons = {
    Mobiles: "5G",
    Laptops: "PC",
    Audio: "AU",
    TVs: "TV",
    Accessories: "USB",
    Appliances: "AIR"
  };

  const categoryRail = categories.map((item) => ({
    href: `/category/${slugify(item.category)}`,
    label: item.category,
    icon: categoryIcons[item.category] || item.category.slice(0, 3).toUpperCase(),
    meta: `${item.count} products`
  }));

  const bankOffers = [
    {
      label: "HDFC",
      title: "Up to 5% extra savings on premium phones",
      note: "Instant discount plus no-cost EMI on select cards",
      href: samsungMobile ? `/product/${samsungMobile.slug}` : "/products",
      tone: "light"
    },
    {
      label: "ICICI",
      title: "7.5% instant discount up to Rs 7,500",
      note: "Great fit for laptops and big-ticket upgrades",
      href: appleLaptop ? `/product/${appleLaptop.slug}` : "/products",
      tone: "red"
    },
    {
      label: "SBI",
      title: "Save up to Rs 2,500 on TVs and audio",
      note: "Debit and credit card offer applied at checkout",
      href: lgTv ? `/product/${lgTv.slug}` : "/products",
      tone: "red"
    },
    {
      label: "EMI",
      title: "Flexible monthly plans across the store",
      note: "Easy checkout for accessories, appliances, and more",
      href: "/products",
      tone: "dark"
    }
  ];

  const watchOut = [
    {
      kicker: samsungMobile?.brand || "Samsung",
      title: "Galaxy S24 Ultra 5G",
      subtitle: "Flagship camera phone with memory upgrades",
      price: `Starting at ${currency(samsungMobile?.price || 119999)}`,
      href: samsungMobile ? `/product/${samsungMobile.slug}` : "/products",
      image: samsungMobile?.image || "/public/assets/products/samsung-s24-ultra-1.png",
      tone: "lavender"
    },
    {
      kicker: sonyAudio?.brand || "Sony",
      title: "WH-1000XM5 Headphones",
      subtitle: "Adaptive ANC and all-day comfort",
      price: `Starting at ${currency(sonyAudio?.price || 24990)}`,
      href: sonyAudio ? `/product/${sonyAudio.slug}` : "/products",
      image: sonyAudio?.image || "/public/assets/products/sony-wh1000xm5-1.png",
      tone: "mist"
    },
    {
      kicker: lgTv?.brand || "LG",
      title: "OLED 4K Smart TV",
      subtitle: "Dolby-ready entertainment upgrade",
      price: `Starting at ${currency(lgTv?.price || 129990)}`,
      href: lgTv ? `/product/${lgTv.slug}` : "/products",
      image: lgTv?.image || "/public/assets/products/lg-oled-c5-1.png",
      tone: "silver"
    },
    {
      kicker: "Deals",
      title: "Corner Specials",
      subtitle: "Explore top offers across every category",
      price: "Up to 40% off selected electronics",
      href: "/products",
      image: philipsAppliance?.image || "/public/assets/products/philips-airfryer-1.png",
      tone: "midnight"
    }
  ];

  const whatsHot = [
    {
      kicker: "OnePlus Style",
      title: "5G Phones",
      price: currency(samsungMobile?.price || 69999),
      note: "Camera-first picks for everyday upgrades",
      href: "/category/mobiles",
      image: samsungMobile?.images?.[1] || samsungMobile?.image || "/public/assets/products/samsung-s24-ultra-2.png",
      tone: "indigo"
    },
    {
      kicker: "LG",
      title: "QLED and OLED TVs",
      price: currency(lgTv?.price || 12490),
      note: "Big-screen viewing with rich contrast",
      href: lgTv ? `/product/${lgTv.slug}` : "/category/tvs",
      image: lgTv?.images?.[1] || lgTv?.image || "/public/assets/products/lg-oled-c5-2.png",
      tone: "ember"
    },
    {
      kicker: "Philips",
      title: "Air Fryers",
      price: currency(philipsAppliance?.price || 27190),
      note: "Healthy cooking with less effort",
      href: philipsAppliance ? `/product/${philipsAppliance.slug}` : "/category/appliances",
      image: philipsAppliance?.images?.[1] || philipsAppliance?.image || "/public/assets/products/philips-airfryer-2.png",
      tone: "cyan"
    },
    {
      kicker: "Apple",
      title: "MacBook Picks",
      price: currency(appleLaptop?.price || 65900),
      note: "Thin, light, and ready for work",
      href: appleLaptop ? `/product/${appleLaptop.slug}` : "/category/laptops",
      image: appleLaptop?.images?.[1] || appleLaptop?.image || "/public/assets/products/macbook-air-m3-2.png",
      tone: "orchid"
    }
  ];

  const dealsOfDay = [
    {
      title: "IdeaPad Slim 3",
      subtitle: "Productivity laptop with SSD storage and DDR5 memory",
      price: `Starting at ${currency(lenovoLaptop?.price || 75990)}`,
      note: "Exchange bonus and bank offers available",
      href: lenovoLaptop ? `/product/${lenovoLaptop.slug}` : "/products",
      image: lenovoLaptop?.image || "/public/assets/products/lenovo-ideapad-slim-3-1.png"
    },
    {
      title: "WH-1000XM5 Headphones",
      subtitle: "Premium adaptive ANC and long battery life",
      price: `Starting at ${currency(sonyAudio?.price || 24990)}`,
      note: "Comfortable listening for work, travel, and calls",
      href: sonyAudio ? `/product/${sonyAudio.slug}` : "/products",
      image: sonyAudio?.image || "/public/assets/products/sony-wh1000xm5-1.png"
    },
    {
      title: "25W Type-C Fast Charger",
      subtitle: "Compact PD charging for phones and tablets",
      price: `Starting at ${currency(samsungCharger?.price || 1399)}`,
      note: "Travel-ready design with fast USB-C output",
      href: samsungCharger ? `/product/${samsungCharger.slug}` : "/products",
      image: samsungCharger?.image || "/public/assets/products/samsung-25w-charger-1.png"
    },
    {
      title: "Galaxy S24 Ultra Variants",
      subtitle: "Compare memory size and premium color options",
      price: `Starting at ${currency(samsungMobile?.price || 119999)}`,
      note: "256GB, 512GB, and 1TB options available",
      href: samsungMobile ? `/product/${samsungMobile.slug}` : "/products",
      image: samsungMobile?.images?.[1] || samsungMobile?.image || "/public/assets/products/samsung-s24-ultra-2.png"
    }
  ];

  return layout({
    title: "ElectroHub | Electronics",
    description: "Multi-page electronics website with banners, shopping cart, checkout, and order tracking.",
    currentPath: "/",
    user,
    content: `
      <main class="croma-home">
        <section class="rail-panel">
          <div class="rail-shell" data-rail>
            <button class="rail-arrow prev" type="button" aria-label="Previous categories" data-rail-prev>&lsaquo;</button>
            <div class="icon-rail" data-rail-track>
              ${categoryRail.map((item) => `
                <a class="icon-tile" href="${item.href}">
                  <span class="icon-badge">${escapeHtml(item.icon)}</span>
                  <strong>${escapeHtml(item.label)}</strong>
                  <small>${escapeHtml(item.meta)}</small>
                </a>
              `).join("")}
            </div>
            <button class="rail-arrow next" type="button" aria-label="Next categories" data-rail-next>&rsaquo;</button>
          </div>
        </section>

        <section class="hero-carousel croma-hero" data-carousel>
          <div class="carousel-viewport">
            ${heroSlides.map((slide, index) => `
              <article class="carousel-slide ${index === 0 ? "active" : ""}" data-carousel-slide data-tone="${slide.palette}">
                <div class="carousel-overlay"></div>
                <div class="carousel-content">
                  <span class="carousel-brand">${escapeHtml(slide.eyebrow)}</span>
                  <h1>${escapeHtml(slide.title)}</h1>
                  <p class="carousel-price">${escapeHtml(slide.priceLine)}</p>
                  <p class="carousel-note">${escapeHtml(slide.note)}</p>
                  <div class="hero-actions">
                    <a class="shop-now-button" href="${slide.href}">Shop now</a>
                    <a class="ghost-button light" href="/products">View all products</a>
                  </div>
                </div>
                <div class="carousel-art">
                  <img src="${slide.image}" alt="${escapeHtml(slide.title)}">
                </div>
              </article>
            `).join("")}
            <button class="carousel-arrow prev" type="button" aria-label="Previous slide" data-carousel-prev>&lsaquo;</button>
            <button class="carousel-arrow next" type="button" aria-label="Next slide" data-carousel-next>&rsaquo;</button>
          </div>
          <div class="carousel-dots">
            ${heroSlides.map((slide, index) => `
              <button class="carousel-dot ${index === 0 ? "active" : ""}" type="button" aria-label="Go to slide ${index + 1}" data-carousel-dot="${index}"></button>
            `).join("")}
          </div>
        </section>

        <section class="croma-section">
          <div class="section-head light compact-head">
            <div><h2>Exciting Bank Offers For You</h2></div>
          </div>
          <div class="rail-shell" data-rail>
            <button class="rail-arrow prev" type="button" aria-label="Previous offers" data-rail-prev>&lsaquo;</button>
            <div class="bank-offer-rail" data-rail-track>
              ${bankOffers.map((offer) => `
                <a class="bank-offer ${offer.tone}" href="${offer.href}">
                  <span>${escapeHtml(offer.label)}</span>
                  <strong>${escapeHtml(offer.title)}</strong>
                  <small>${escapeHtml(offer.note)}</small>
                </a>
              `).join("")}
            </div>
            <button class="rail-arrow next" type="button" aria-label="Next offers" data-rail-next>&rsaquo;</button>
          </div>
        </section>

        <section class="croma-section">
          <div class="section-head light compact-head">
            <div><h2>Watch Out For This</h2></div>
          </div>
          <div class="watch-grid">
            ${watchOut.map((item) => `
              <a class="watch-card ${item.tone}" href="${item.href}">
                <span>${escapeHtml(item.kicker)}</span>
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.subtitle)}</small>
                <img src="${item.image}" alt="${escapeHtml(item.title)}">
                <em>${escapeHtml(item.price)}</em>
              </a>
            `).join("")}
          </div>
        </section>

        <section class="croma-section">
          <div class="section-head light compact-head">
            <div><h2>What's Hot</h2></div>
          </div>
          <div class="hot-strip-grid">
            ${whatsHot.map((item) => `
              <a class="hot-strip-card ${item.tone}" href="${item.href}">
                <span>${escapeHtml(item.kicker)}</span>
                <strong>${escapeHtml(item.title)}</strong>
                <img src="${item.image}" alt="${escapeHtml(item.title)}">
                <p>Starting at ${escapeHtml(item.price)}</p>
                <small>${escapeHtml(item.note)}</small>
              </a>
            `).join("")}
          </div>
        </section>

        <section class="croma-section">
          <div class="section-head light compact-head">
            <div><h2>Deals Of The Day</h2></div>
          </div>
          <div class="rail-shell" data-rail>
            <button class="rail-arrow prev" type="button" aria-label="Previous deals" data-rail-prev>&lsaquo;</button>
            <div class="deal-rail" data-rail-track>
              ${dealsOfDay.map((deal) => `
                <a class="deal-rail-card" href="${deal.href}">
                  <img src="${deal.image}" alt="${escapeHtml(deal.title)}">
                  <strong>${escapeHtml(deal.title)}</strong>
                  <span>${escapeHtml(deal.subtitle)}</span>
                  <b>${escapeHtml(deal.price)}</b>
                  <small>${escapeHtml(deal.note)}</small>
                </a>
              `).join("")}
            </div>
            <button class="rail-arrow next" type="button" aria-label="Next deals" data-rail-next>&rsaquo;</button>
          </div>
        </section>
      </main>
    `
  });
}

function productsPage(url, forcedCategory = "", user = null) {
  const q = (url.searchParams.get("q") || "").trim();
  const category = forcedCategory || (url.searchParams.get("category") || "").trim();
  const sort = url.searchParams.get("sort") || "popular";
  const page = Math.max(Number(url.searchParams.get("page") || "1"), 1);
  const pageSize = 16;
  const where = [];
  const params = [];

  if (q) {
    where.push("(name LIKE ? OR brand LIKE ? OR category LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (category) {
    where.push("category = ?");
    params.push(category);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderClause = sort === "price-asc"
    ? "ORDER BY price ASC"
    : sort === "price-desc"
      ? "ORDER BY price DESC"
      : sort === "rating"
        ? "ORDER BY rating DESC, reviews DESC"
        : "ORDER BY featured DESC, reviews DESC";

  const allItems = db.prepare(`SELECT * FROM products ${whereClause} ${orderClause}`).all(...params).map(normalizeProduct);
  const uniqueItems = uniqueProductsByFamily(allItems);
  const total = uniqueItems.length;
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const offset = (Math.min(page, pages) - 1) * pageSize;
  const items = uniqueItems.slice(offset, offset + pageSize);
  const categories = getCategories();

  return layout({
    title: category ? `${category} | ElectroHub` : "All Products | ElectroHub",
    description: "Browse the full electronics catalog with filters and sorting.",
    currentPath: "/products",
    user,
    content: `
      <main class="section catalog-shell">
        <div class="section-head catalog-head">
          <div>
            <p class="eyebrow">Catalog</p>
            <h1 class="page-title">${category ? escapeHtml(category) : "All electronics"}</h1>
            <p class="subtle">${total} products available${q ? ` for "${escapeHtml(q)}"` : ""}</p>
          </div>
        </div>

        <div class="catalog-layout">
          <aside class="filter-card catalog-filter-card">
            <form action="${category ? `/category/${slugify(category)}` : "/products"}" method="GET" class="filter-form">
              <label>
                Search
                <input type="search" name="q" value="${escapeHtml(q)}" placeholder="Search by name or brand">
              </label>
              ${forcedCategory ? "" : `
                <label>
                  Category
                  <select name="category">
                    <option value="">All categories</option>
                    ${categories.map((item) => `<option value="${escapeHtml(item.category)}" ${item.category === category ? "selected" : ""}>${escapeHtml(item.category)}</option>`).join("")}
                  </select>
                </label>
              `}
              <label>
                Sort by
                <select name="sort">
                  <option value="popular" ${sort === "popular" ? "selected" : ""}>Popularity</option>
                  <option value="price-asc" ${sort === "price-asc" ? "selected" : ""}>Price: Low to high</option>
                  <option value="price-desc" ${sort === "price-desc" ? "selected" : ""}>Price: High to low</option>
                  <option value="rating" ${sort === "rating" ? "selected" : ""}>Customer rating</option>
                </select>
              </label>
              <button class="primary-button" type="submit">Apply filters</button>
            </form>
          </aside>

          <section class="catalog-results">
            <div class="catalog-toolbar">
              <div class="catalog-summary">
                <strong>${total}</strong>
                <span>${category ? `${escapeHtml(category)} products` : "Products in catalog"}</span>
              </div>
              <div class="catalog-sort-note">Sorted by ${escapeHtml(sort.replace("-", " "))}</div>
            </div>
            <div class="product-grid catalog-product-grid">
              ${items.map(productCard).join("")}
            </div>
            <div class="pagination">
              ${Array.from({ length: pages }, (_, index) => {
                const number = index + 1;
                const pageUrl = new URL(url.pathname, "http://localhost");
                if (q) pageUrl.searchParams.set("q", q);
                if (!forcedCategory && category) pageUrl.searchParams.set("category", category);
                if (sort) pageUrl.searchParams.set("sort", sort);
                pageUrl.searchParams.set("page", number);
                return `<a class="${number === Math.min(page, pages) ? "active" : ""}" href="${pageUrl.pathname}${pageUrl.search}">${number}</a>`;
              }).join("")}
            </div>
          </section>
        </div>
      </main>
    `
  });
}

function legacyProductDetailPage(slug, user = null) {
  const found = db.prepare("SELECT * FROM products WHERE slug = ?").get(slug);
  const product = found ? normalizeProduct(found) : null;
  if (!product) {
    return notFoundPage();
  }

  const related = uniqueProductsByFamily(
    db.prepare("SELECT * FROM products WHERE category = ? AND slug != ? LIMIT 12").all(product.category, product.slug).map(normalizeProduct)
  ).filter((item) => item.familyKey !== product.familyKey).slice(0, 4);
  const specs = product.specs;
  const discount = Math.max(product.original_price - product.price, 0);
  const familyVariants = getFamilyVariants(product);
  const memoryVariants = [...new Map(familyVariants.filter((item) => item.memory).map((item) => [item.memory, item])).values()];
  const colorVariants = [...new Map(familyVariants.filter((item) => item.color).map((item) => [item.color, item])).values()];
  const galleryVideos = [
    {
      title: `${product.brand} spotlight`,
      caption: "Design and finish overview",
      poster: product.images[0] || product.image,
      frames: product.images.slice(0, 3)
    },
    {
      title: `${product.category} demo`,
      caption: "Ports, profile, and usage angles",
      poster: product.images[1] || product.images[0] || product.image,
      frames: [...product.images].reverse().slice(0, 3)
    }
  ];
  const featureTable = [
    ["Brand", product.brand],
    ["Category", product.category],
    ["Colour", product.color || "Standard"],
    ["Memory", product.memory || "See variants"],
    ["Stock", `${product.stock} units`],
    ["SKU", `EH-${product.id}`]
  ];
  const specificationSections = [
    {
      title: "General",
      rows: [
        ["Brand", product.brand],
        ["Category", product.category],
        ["Model", product.name],
        ["SKU", `EH-${product.id}`]
      ]
    },
    {
      title: "Storage & Variant",
      rows: [
        ["Colour", product.color || "Standard"],
        ["Internal Storage", product.memory || "See variants"],
        ["Stock", `${product.stock} units available`]
      ]
    },
    {
      title: "Highlights",
      rows: specs.slice(0, 5).map((spec, index) => [`Feature ${index + 1}`, spec])
    }
  ];

  return layout({
    title: `${product.name} | ElectroHub`,
    description: product.description,
    currentPath: "/products",
    user,
    content: `
      <main class="section">
        <div class="product-detail">
          <div class="product-gallery">
            <img class="${imageToneClass(product)}" data-gallery-main src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
            <div class="thumb-row">
              ${product.images.slice(0, 4).map((image, index) => `<img class="thumb ${imageToneClass(product)} ${index === 0 ? "active" : ""}" data-gallery-thumb src="${escapeHtml(image)}" data-full-image="${escapeHtml(image)}" alt="${escapeHtml(product.name)} ${index + 1}">`).join("")}
            </div>
          </div>
          <div class="detail-copy">
            <p class="eyebrow">${escapeHtml(product.category)}</p>
            <h1 class="page-title">${escapeHtml(product.name)}</h1>
            <p class="subtle">${escapeHtml(product.brand)} · ${product.rating} ★ · ${product.reviews.toLocaleString("en-IN")} ratings & reviews</p>
            ${product.color ? `<div class="color-chip detail-color">${escapeHtml(product.color)}</div>` : ""}
            ${memoryVariants.length ? `
              <div class="variant-block">
                <strong>Memory options</strong>
                <div class="variant-row">
                  ${memoryVariants.map((item) => `<a class="variant-pill ${item.slug === product.slug ? "active" : ""}" href="/product/${item.slug}">${escapeHtml(item.memory)}</a>`).join("")}
                </div>
              </div>
            ` : ""}
            ${colorVariants.length ? `
              <div class="variant-block">
                <strong>Colour options</strong>
                <div class="variant-row">
                  ${colorVariants.map((item) => `<a class="variant-pill ${item.slug === product.slug ? "active" : ""}" href="/product/${item.slug}">${escapeHtml(item.color)}</a>`).join("")}
                </div>
              </div>
            ` : ""}
            <div class="price-row detail-price">
              <strong>${currency(product.price)}</strong>
              <del>${currency(product.original_price)}</del>
              <span class="save-chip">Save ${currency(discount)}</span>
            </div>
            <div class="delivery-box">
              <strong>Delivery at your pincode</strong>
              <span>Fast dispatch, installation guidance, and support options available.</span>
            </div>
            <div class="offer-stack">
              <article>
                <strong>Bank offer</strong>
                <span>Instant savings on select cards and EMI plans.</span>
              </article>
              <article>
                <strong>Exchange bonus</strong>
                <span>Eligible device exchange benefits on premium categories.</span>
              </article>
              <article>
                <strong>Protection plans</strong>
                <span>Add extended warranty and accidental damage support.</span>
              </article>
            </div>
            <p class="detail-description">${escapeHtml(product.description)}</p>
            <div class="spec-list">
              ${specs.map((spec) => `<span>${escapeHtml(spec)}</span>`).join("")}
            </div>
            <p class="stock ${product.stock < 10 ? "low" : ""}">${product.stock} units ready to dispatch</p>
            <div class="buy-strip">
              <button class="primary-button large-button" data-add-to-cart='${JSON.stringify({
                id: product.id,
                slug: product.slug,
                name: product.name,
                price: product.price,
                image: product.image
              }).replace(/'/g, "&apos;")}'>Add to cart</button>
              <a class="ghost-button large-button" href="/checkout">Buy now</a>
            </div>
          </div>
        </div>

        <section class="section info-panels">
          <article class="panel-card">
            <h2>Key features</h2>
            ${specs.map((spec) => `<div class="summary-line border-row"><span>${escapeHtml(spec)}</span><strong>Included</strong></div>`).join("")}
          </article>
          <article class="panel-card">
            <h2>Why buy from ElectroHub</h2>
            <div class="summary-line border-row"><span>Installation & guidance</span><strong>Available</strong></div>
            <div class="summary-line border-row"><span>Secure checkout</span><strong>Enabled</strong></div>
            <div class="summary-line border-row"><span>Order tracking</span><strong>Live</strong></div>
            <div class="summary-line border-row"><span>Support plans</span><strong>Add-on</strong></div>
          </article>
        </section>

        <section class="section info-panels">
          <article class="panel-card">
            <h2>Product details</h2>
            ${featureTable.map(([label, value]) => `<div class="summary-line border-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
          </article>
          <article class="panel-card">
            <h2>In the box</h2>
            <div class="summary-line border-row"><span>${escapeHtml(product.name)}</span><strong>1 Unit</strong></div>
            <div class="summary-line border-row"><span>User guide</span><strong>Included</strong></div>
            <div class="summary-line border-row"><span>Warranty card</span><strong>Included</strong></div>
            <div class="summary-line border-row"><span>Brand accessories</span><strong>As applicable</strong></div>
          </article>
        </section>

        <section class="section section-inner">
          <div class="section-head">
            <div>
              <p class="eyebrow">Similar products</p>
              <h2>More from ${escapeHtml(product.category)}</h2>
            </div>
          </div>
          <div class="product-grid compact-grid">
            ${related.map(productCard).join("")}
          </div>
        </section>
      </main>
    `
  });
}

function productDetailPageLegacyV2(slug, user = null) {
  const found = db.prepare("SELECT * FROM products WHERE slug = ?").get(slug);
  const product = found ? normalizeProduct(found) : null;
  if (!product) {
    return notFoundPage();
  }

  const related = uniqueProductsByFamily(
    db.prepare("SELECT * FROM products WHERE category = ? AND slug != ? LIMIT 12").all(product.category, product.slug).map(normalizeProduct)
  ).filter((item) => item.familyKey !== product.familyKey).slice(0, 4);
  const specs = product.specs;
  const familyVariants = getFamilyVariants(product);
  const memoryVariants = [...new Map(familyVariants.filter((item) => item.memory).map((item) => [item.memory, item])).values()];
  const colorVariants = [...new Map(familyVariants.filter((item) => item.color).map((item) => [item.color, item])).values()];
  const featureTable = [
    ["Brand", product.brand],
    ["Category", product.category],
    ["Colour", product.color || "Standard"],
    ["Memory", product.memory || "See variants"],
    ["Stock", `${product.stock} units`],
    ["SKU", `EH-${product.id}`]
  ];

  return layout({
    title: `${product.name} | ElectroHub`,
    description: product.description,
    currentPath: "/products",
    user,
    content: `
      <main class="section product-page-shell">
        <div class="product-stage">
          <div class="product-breadcrumbs">
            <a href="/">Home</a>
            <span>&rsaquo;</span>
            <a href="/products">Products</a>
            <span>&rsaquo;</span>
            <a href="/category/${slugify(product.category)}">${escapeHtml(product.category)}</a>
          </div>

          <div class="product-detail croma-product-detail">
            <div class="product-media-rail">
              <div class="product-hero-panel">
                <div class="gallery-stage" data-gallery-stage>
                  <img class="detail-hero-image ${imageToneClass(product)}" data-gallery-main src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
                </div>
              </div>
              <div class="thumb-column media-grid">
                ${product.images.slice(0, 4).map((image, index) => `
                  <button
                    class="media-thumb image-thumb ${index === 0 ? "active" : ""}"
                    type="button"
                    data-gallery-item
                    data-gallery-type="image"
                    data-gallery-src="${escapeHtml(image)}"
                    aria-label="${escapeHtml(product.name)} image ${index + 1}">
                    <img
                      class="thumb detail-thumb ${imageToneClass(product)}"
                      src="${escapeHtml(image)}"
                      alt="${escapeHtml(product.name)} ${index + 1}">
                  </button>
                `).join("")}
                <button class="video-thumb" type="button" data-gallery-video="${escapeHtml(product.images[0] || product.image)}" aria-label="Play product video">
                  <span class="video-thumb-play">▶</span>
                </button>
              </div>
              <div class="product-hero-panel">
                <div class="gallery-stage" data-gallery-stage>
                  <img class="detail-hero-image ${imageToneClass(product)}" data-gallery-main src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
                </div>
              </div>
              <button class="thumb-nav thumb-nav-down" type="button" aria-label="Scroll thumbnails down" data-thumb-next>&darr;</button>
              <div class="product-utility-row">
                <label class="compare-toggle">
                  <input type="checkbox">
                  <span>Compare</span>
                </label>
                <a class="store-link" href="/products">Connect to Store</a>
              </div>
            </div>

            <div class="detail-copy detail-copy-dark">
              <div class="detail-topbar">
                <p class="eyebrow">${escapeHtml(product.category)}</p>
                <div class="detail-icon-row" aria-hidden="true">
                  <span class="detail-icon-pill">♡</span>
                  <span class="detail-icon-pill">⇪</span>
                </div>
              </div>
              <h1 class="page-title">${escapeHtml(product.name)}</h1>
              <p class="detail-meta">${escapeHtml(product.brand)} · ${product.rating} stars · ${product.reviews.toLocaleString("en-IN")} ratings & reviews</p>
              <a class="review-link" href="#key-features">Be the first one to review</a>

              <div class="detail-price-cluster">
                <strong>${currency(product.price)}</strong>
                <span class="emi-separator">OR</span>
                <span class="emi-copy">${currency(Math.round(product.price / 24))}/mo</span>
              </div>
              <p class="detail-tax">(Incl. all taxes)</p>

              ${colorVariants.length ? `
                <div class="variant-block detail-variant-block">
                  <strong>Brand Colour</strong>
                  <div class="variant-row">
                    ${colorVariants.map((item) => `<a class="variant-pill dark-pill ${item.slug === product.slug ? "active" : ""}" href="/product/${item.slug}">${escapeHtml(item.color)}</a>`).join("")}
                  </div>
                </div>
              ` : ""}

              ${memoryVariants.length ? `
                <div class="variant-block detail-variant-block">
                  <strong>Internal Storage</strong>
                  <div class="variant-row">
                    ${memoryVariants.map((item) => `<a class="variant-pill dark-pill ${item.slug === product.slug ? "active" : ""}" href="/product/${item.slug}">${escapeHtml(item.memory)}</a>`).join("")}
                  </div>
                </div>
              ` : ""}

              <div class="variant-block detail-variant-block">
                <strong>Availability</strong>
                <div class="variant-row">
                  <span class="variant-pill dark-pill active">${product.stock} in stock</span>
                </div>
              </div>

              <div class="savings-panel">
                <h2>Super Savings (2 Offers)</h2>
                <div class="offer-stack dark-offers">
                  <article>
                    <strong>Instant discount</strong>
                    <span>Get up to ${currency(Math.max(2000, Math.round(product.price * 0.05)))} off on eligible credit cards.</span>
                  </article>
                  <article>
                    <strong>No-cost EMI</strong>
                    <span>Flexible EMI plans available on select bank cards for premium orders.</span>
                  </article>
                </div>
              </div>

              <div class="delivery-box dark-delivery">
                <strong>Delivery at Mumbai, 400049</strong>
                <span>Usually delivered within 2-4 days with setup guidance available.</span>
              </div>

              <div class="inline-features-card">
                <h2>Key Features</h2>
                <ul class="inline-features-list">
                  ${specs.slice(0, 6).map((spec) => `<li>${escapeHtml(spec)}</li>`).join("")}
                </ul>
              </div>

              <div class="buy-strip detail-buy-strip">
                <a class="primary-button large-button buy-now-button" href="/checkout">Buy now</a>
                <button class="ghost-button large-button dark-ghost add-cart-dark" data-add-to-cart='${JSON.stringify({
                  id: product.id,
                  slug: product.slug,
                  name: product.name,
                  price: product.price,
                  image: product.image
                }).replace(/'/g, "&apos;")}'>Add to cart</button>
              </div>
            </div>
          </div>
        </div>

        <section class="section product-lower-grid" id="key-features">
          <article class="panel-card key-features-card">
            <h2>Key Features</h2>
            <ul class="key-features-list">
              ${specs.map((spec) => `<li>${escapeHtml(spec)}</li>`).join("")}
            </ul>
          </article>
          <article class="panel-card specifications-card">
            <h2>Specifications</h2>
            <div class="spec-accordion">
              ${specificationSections.map((section, index) => `
                <details class="spec-item" ${index === 0 ? "open" : ""}>
                  <summary>${escapeHtml(section.title)}</summary>
                  <div class="spec-item-body">
                    ${section.rows.map(([label, value]) => `
                      <div class="summary-line border-row">
                        <span>${escapeHtml(label)}</span>
                        <strong>${escapeHtml(value)}</strong>
                      </div>
                    `).join("")}
                  </div>
                </details>
              `).join("")}
            </div>
            <div class="description-block">
              <h3>Description</h3>
              <p class="detail-description">${escapeHtml(product.description)}</p>
            </div>
          </article>
        </section>

        <section class="section section-inner product-related-dark">
          <div class="section-head">
            <div>
              <p class="eyebrow">Similar products</p>
              <h2>More from ${escapeHtml(product.category)}</h2>
            </div>
          </div>
          <div class="product-grid compact-grid">
            ${related.map(productCard).join("")}
          </div>
        </section>
      </main>
    `
  });
}

function productDetailPageLegacyV3(slug, user = null) {
  const found = db.prepare("SELECT * FROM products WHERE slug = ?").get(slug);
  const product = found ? normalizeProduct(found) : null;
  if (!product) {
    return notFoundPage();
  }

  const related = uniqueProductsByFamily(
    db.prepare("SELECT * FROM products WHERE category = ? AND slug != ? LIMIT 12").all(product.category, product.slug).map(normalizeProduct)
  ).filter((item) => item.familyKey !== product.familyKey).slice(0, 4);
  const specs = product.specs;
  const familyVariants = getFamilyVariants(product);
  const memoryVariants = [...new Map(familyVariants.filter((item) => item.memory).map((item) => [item.memory, item])).values()];
  const colorVariants = [...new Map(familyVariants.filter((item) => item.color).map((item) => [item.color, item])).values()];
  const galleryVideos = [
    {
      title: `${product.brand} Spotlight`,
      caption: "Design and finish overview",
      frames: product.images.slice(0, 3)
    },
    {
      title: `${product.category} Demo`,
      caption: "Ports, profile, and daily-use angles",
      frames: [...product.images].reverse().slice(0, 3)
    }
  ];
  const specificationSections = [
    {
      title: "General",
      rows: [
        ["Brand", product.brand],
        ["Category", product.category],
        ["Model", product.name],
        ["SKU", `EH-${product.id}`]
      ]
    },
    {
      title: "Storage & Variant",
      rows: [
        ["Colour", product.color || "Standard"],
        ["Internal Storage", product.memory || "See variants"],
        ["Stock", `${product.stock} units available`]
      ]
    },
    {
      title: "Highlights",
      rows: specs.slice(0, 5).map((spec, index) => [`Feature ${index + 1}`, spec])
    }
  ];

  return layout({
    title: `${product.name} | ElectroHub`,
    description: product.description,
    currentPath: "/products",
    user,
    content: `
      <main class="section product-page-shell">
        <div class="product-stage">
          <div class="product-breadcrumbs">
            <a href="/">Home</a>
            <span>&rsaquo;</span>
            <a href="/products">Products</a>
            <span>&rsaquo;</span>
            <a href="/category/${slugify(product.category)}">${escapeHtml(product.category)}</a>
          </div>

          <div class="product-detail croma-product-detail">
            <div class="product-media-rail">
              <button class="thumb-nav thumb-nav-up" type="button" aria-label="Scroll thumbnails up" data-thumb-prev>&uarr;</button>
              <div class="thumb-column">
                ${product.images.slice(0, 4).map((image, index) => `
                  <button
                    class="media-thumb image-thumb ${index === 0 ? "active" : ""}"
                    type="button"
                    data-gallery-item
                    data-gallery-type="image"
                    data-gallery-src="${escapeHtml(image)}"
                    aria-label="${escapeHtml(product.name)} image ${index + 1}">
                    <img
                      class="thumb detail-thumb ${imageToneClass(product)}"
                      src="${escapeHtml(image)}"
                      alt="${escapeHtml(product.name)} ${index + 1}">
                  </button>
                `).join("")}
                ${galleryVideos.map((video, index) => `
                  <button
                    class="media-thumb video-thumb"
                    type="button"
                    data-gallery-item
                    data-gallery-type="video"
                    data-video-title="${escapeHtml(video.title)}"
                    data-video-caption="${escapeHtml(video.caption)}"
                    data-video-frames='${escapeHtml(JSON.stringify(video.frames))}'
                    aria-label="${escapeHtml(video.title)}">
                    <img class="thumb detail-thumb ${imageToneClass(product)}" src="${escapeHtml(video.frames[0] || product.image)}" alt="${escapeHtml(video.title)}">
                    <span class="video-thumb-badge"><span class="video-thumb-play"></span><small>Video ${index + 1}</small></span>
                  </button>
                `).join("")}
              </div>
              <div class="product-hero-panel">
                <div class="gallery-stage" data-gallery-stage>
                  <img class="detail-hero-image ${imageToneClass(product)}" data-gallery-main src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
                </div>
              </div>
              <button class="thumb-nav thumb-nav-down" type="button" aria-label="Scroll thumbnails down" data-thumb-next>&darr;</button>
              <div class="product-utility-row">
                <label class="compare-toggle">
                  <input type="checkbox">
                  <span>Compare</span>
                </label>
                <a class="store-link" href="/products">Connect to Store</a>
              </div>
            </div>

            <div class="detail-copy detail-copy-dark">
              <div class="detail-topbar">
                <p class="eyebrow">${escapeHtml(product.category)}</p>
                <div class="detail-icon-row" aria-hidden="true">
                  <span class="detail-icon-pill"></span>
                  <span class="detail-icon-pill"></span>
                </div>
              </div>
              <h1 class="page-title">${escapeHtml(product.name)}</h1>
              <p class="detail-meta">${escapeHtml(product.brand)} · ${product.rating} stars · ${product.reviews.toLocaleString("en-IN")} ratings & reviews</p>
              <a class="review-link" href="#key-features">Be the first one to review</a>

              <div class="detail-price-cluster">
                <strong>${currency(product.price)}</strong>
                <span class="emi-separator">OR</span>
                <span class="emi-copy">${currency(Math.round(product.price / 24))}/mo</span>
              </div>
              <p class="detail-tax">(Incl. all taxes)</p>

              ${colorVariants.length ? `
                <div class="variant-block detail-variant-block">
                  <strong>Brand Colour</strong>
                  <div class="variant-row">
                    ${colorVariants.map((item) => `<a class="variant-pill dark-pill ${item.slug === product.slug ? "active" : ""}" href="/product/${item.slug}">${escapeHtml(item.color)}</a>`).join("")}
                  </div>
                </div>
              ` : ""}

              ${memoryVariants.length ? `
                <div class="variant-block detail-variant-block">
                  <strong>Internal Storage</strong>
                  <div class="variant-row">
                    ${memoryVariants.map((item) => `<a class="variant-pill dark-pill ${item.slug === product.slug ? "active" : ""}" href="/product/${item.slug}">${escapeHtml(item.memory)}</a>`).join("")}
                  </div>
                </div>
              ` : ""}

              <div class="variant-block detail-variant-block">
                <strong>Availability</strong>
                <div class="variant-row">
                  <span class="variant-pill dark-pill active">${product.stock} in stock</span>
                </div>
              </div>

              <div class="savings-panel">
                <h2>Super Savings (2 Offers)</h2>
                <div class="offer-stack dark-offers">
                  <article>
                    <strong>Instant discount</strong>
                    <span>Get up to ${currency(Math.max(2000, Math.round(product.price * 0.05)))} off on eligible credit cards.</span>
                  </article>
                  <article>
                    <strong>No-cost EMI</strong>
                    <span>Flexible EMI plans available on select bank cards for premium orders.</span>
                  </article>
                </div>
              </div>

              <div class="delivery-box dark-delivery">
                <strong>Delivery at Mumbai, 400049</strong>
                <span>Usually delivered within 2-4 days with setup guidance available.</span>
              </div>

              <div class="buy-strip detail-buy-strip">
                <a class="primary-button large-button buy-now-button" href="/checkout">Buy now</a>
                <button class="ghost-button large-button dark-ghost add-cart-dark" data-add-to-cart='${JSON.stringify({
                  id: product.id,
                  slug: product.slug,
                  name: product.name,
                  price: product.price,
                  image: product.image
                }).replace(/'/g, "&apos;")}'>Add to cart</button>
              </div>
            </div>
          </div>
        </div>

        <section class="section product-lower-grid" id="key-features">
          <article class="panel-card key-features-card">
            <h2>Key Features</h2>
            <ul class="key-features-list">
              ${specs.map((spec) => `<li>${escapeHtml(spec)}</li>`).join("")}
            </ul>
          </article>
          <article class="panel-card specifications-card">
            <h2>Specifications</h2>
            <div class="spec-accordion">
              ${specificationSections.map((section, index) => `
                <details class="spec-item" ${index === 0 ? "open" : ""}>
                  <summary>${escapeHtml(section.title)}</summary>
                  <div class="spec-item-body">
                    ${section.rows.map(([label, value]) => `
                      <div class="summary-line border-row">
                        <span>${escapeHtml(label)}</span>
                        <strong>${escapeHtml(value)}</strong>
                      </div>
                    `).join("")}
                  </div>
                </details>
              `).join("")}
            </div>
            <div class="description-block">
              <h3>Description</h3>
              <p class="detail-description">${escapeHtml(product.description)}</p>
            </div>
          </article>
        </section>

        <section class="section section-inner product-related-dark">
          <div class="section-head">
            <div>
              <p class="eyebrow">Similar products</p>
              <h2>More from ${escapeHtml(product.category)}</h2>
            </div>
          </div>
          <div class="product-grid compact-grid">
            ${related.map(productCard).join("")}
          </div>
        </section>
      </main>
    `
  });
}

function productDetailPageCleanLegacyV4(slug, user = null) {
  const found = db.prepare("SELECT * FROM products WHERE slug = ?").get(slug);
  const product = found ? normalizeProduct(found) : null;
  if (!product) {
    return notFoundPage();
  }

  const related = uniqueProductsByFamily(
    db.prepare("SELECT * FROM products WHERE category = ? AND slug != ? LIMIT 12").all(product.category, product.slug).map(normalizeProduct)
  ).filter((item) => item.familyKey !== product.familyKey).slice(0, 4);
  const specs = product.specs;
  const familyVariants = getFamilyVariants(product);
  const memoryVariants = [...new Map(familyVariants.filter((item) => item.memory).map((item) => [item.memory, item])).values()];
  const colorVariants = [...new Map(familyVariants.filter((item) => item.color).map((item) => [item.color, item])).values()];
  const galleryItems = product.images.slice(0, 3);

  return layout({
    title: `${product.name} | ElectroHub`,
    description: product.description,
    currentPath: "/products",
    user,
    content: `
      <main class="section product-page-shell clean-pdp-shell">
        <div class="clean-product-detail">
            <div class="clean-gallery-column">
              <div class="clean-main-frame">
                <div class="clean-main-badge">Main Preview</div>
                <div class="gallery-stage" data-gallery-stage>
                  <img class="clean-hero-image ${imageToneClass(product)}" data-gallery-main src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
                </div>
              </div>
              <div class="clean-thumb-row">
              ${galleryItems.map((image, index) => `
                <button
                  class="clean-thumb-card ${index === 0 ? "active" : ""}"
                  type="button"
                  data-gallery-item
                    data-gallery-type="image"
                    data-gallery-src="${escapeHtml(image)}"
                    aria-label="${escapeHtml(product.name)} image ${index + 1}">
                    <img class="${imageToneClass(product)}" src="${escapeHtml(image)}" alt="${escapeHtml(product.name)} ${index + 1}">
                    <span class="clean-thumb-label">Preview ${index + 1}</span>
                  </button>
                `).join("")}
              </div>
          </div>

          <div class="clean-copy-column">
            <p class="clean-category">${escapeHtml(product.category)}</p>
            <h1 class="clean-title">${escapeHtml(product.name)}</h1>
            <p class="clean-meta">${escapeHtml(product.brand)} · ${product.rating} · ${product.reviews.toLocaleString("en-IN")} ratings & reviews</p>
            ${product.color ? `<div class="clean-chip-row"><span class="clean-chip active">${escapeHtml(product.color)}</span></div>` : ""}

            ${memoryVariants.length ? `
              <div class="clean-option-block">
                <strong>Memory options</strong>
                <div class="clean-option-row">
                  ${memoryVariants.map((item) => `<a class="clean-option-pill ${item.slug === product.slug ? "active" : ""}" href="/product/${item.slug}">${escapeHtml(item.memory)}</a>`).join("")}
                </div>
              </div>
            ` : ""}

            ${colorVariants.length ? `
              <div class="clean-option-block">
                <strong>Colour options</strong>
                <div class="clean-option-row">
                  ${colorVariants.map((item) => `<a class="clean-option-pill ${item.slug === product.slug ? "active" : ""}" href="/product/${item.slug}">${escapeHtml(item.color)}</a>`).join("")}
                </div>
              </div>
            ` : ""}

            <div class="clean-price-row">
              <strong>${currency(product.price)}</strong>
              <del>${currency(product.original_price)}</del>
            </div>
            <p class="clean-description">${escapeHtml(product.description)}</p>
            <div class="clean-buy-row">
              <button class="primary-button large-button" data-add-to-cart='${JSON.stringify({
                id: product.id,
                slug: product.slug,
                name: product.name,
                price: product.price,
                image: product.image
              }).replace(/'/g, "&apos;")}'>Add to cart</button>
              <a class="ghost-button large-button" href="/checkout">Buy now</a>
            </div>
          </div>
        </div>

        <section class="section product-lower-grid" id="key-features">
          <article class="panel-card key-features-card">
            <h2>Key Features</h2>
            <ul class="key-features-list">
              ${specs.map((spec) => `<li>${escapeHtml(spec)}</li>`).join("")}
            </ul>
          </article>
          <article class="panel-card specifications-card">
            <h2>Product Details</h2>
            <p class="detail-description">${escapeHtml(product.description)}</p>
            <div class="spec-list">
              ${specs.map((spec) => `<span>${escapeHtml(spec)}</span>`).join("")}
            </div>
          </article>
        </section>

        <section class="section section-inner">
          <div class="section-head">
            <div>
              <p class="eyebrow">Similar products</p>
              <h2>More from ${escapeHtml(product.category)}</h2>
            </div>
          </div>
          <div class="product-grid compact-grid">
            ${related.map(productCard).join("")}
          </div>
        </section>
      </main>
    `
  });
}

function productDetailPage(slug, user = null) {
  const found = db.prepare("SELECT * FROM products WHERE slug = ?").get(slug);
  const product = found ? normalizeProduct(found) : null;
  if (!product) {
    return notFoundPage();
  }

  const related = uniqueProductsByFamily(
    db.prepare("SELECT * FROM products WHERE category = ? AND slug != ? LIMIT 12").all(product.category, product.slug).map(normalizeProduct)
  ).filter((item) => item.familyKey !== product.familyKey).slice(0, 4);
  const specs = product.specs;
  const familyVariants = getFamilyVariants(product);
  const memoryVariants = [...new Map(familyVariants.filter((item) => item.memory).map((item) => [item.memory, item])).values()];
  const colorVariants = [...new Map(familyVariants.filter((item) => item.color).map((item) => [item.color, item])).values()];
  const galleryItems = product.images.slice(0, 4);

  return layout({
    title: `${product.name} | ElectroHub`,
    description: product.description,
    currentPath: "/products",
    user,
    content: `
      <main class="section product-page-shell">
        <div class="product-stage">
          <div class="product-breadcrumbs">
            <a href="/">Phones & Wearables</a>
            <span>&rsaquo;</span>
            <a href="/products">${escapeHtml(product.category)}</a>
            <span>&rsaquo;</span>
            <a href="/category/${slugify(product.category)}">${escapeHtml(product.brand)}</a>
          </div>

          <div class="product-detail croma-product-detail">
            <div class="product-media-rail">
              <button class="thumb-nav thumb-nav-up" type="button" aria-label="Scroll thumbnails up" data-thumb-prev>&uarr;</button>
              <div class="thumb-column">
                ${galleryItems.map((image, index) => `
                  <button
                    class="media-thumb image-thumb ${index === 0 ? "active" : ""}"
                    type="button"
                    data-gallery-item
                    data-gallery-type="image"
                    data-gallery-src="${escapeHtml(image)}"
                    aria-label="${escapeHtml(product.name)} image ${index + 1}">
                    <img class="thumb detail-thumb ${imageToneClass(product)}" src="${escapeHtml(image)}" alt="${escapeHtml(product.name)} ${index + 1}">
                  </button>
                `).join("")}
              </div>
              <div class="product-hero-panel">
                <div class="gallery-stage" data-gallery-stage>
                  <img class="detail-hero-image ${imageToneClass(product)}" data-gallery-main src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
                </div>
              </div>
              <button class="thumb-nav thumb-nav-down" type="button" aria-label="Scroll thumbnails down" data-thumb-next>&darr;</button>
              <div class="product-utility-row">
                <label class="compare-toggle">
                  <input type="checkbox">
                  <span>Compare</span>
                </label>
                <a class="store-link" href="/products">Connect to Store</a>
              </div>
            </div>

            <div class="detail-copy detail-copy-dark">
              <div class="detail-topbar">
                <p class="eyebrow">${escapeHtml(product.category)}</p>
                <div class="detail-icon-row" aria-hidden="true">
                  <span class="detail-icon-pill"></span>
                  <span class="detail-icon-pill"></span>
                </div>
              </div>
              <h1 class="page-title">${escapeHtml(product.name)}</h1>
              <p class="detail-meta">${escapeHtml(product.brand)} · ${product.rating} stars · ${product.reviews.toLocaleString("en-IN")} ratings & reviews</p>
              <a class="review-link" href="#key-features">Be the First One to Review</a>

              <div class="detail-price-cluster">
                <strong>${currency(product.price)}</strong>
                <span class="emi-separator">OR</span>
                <span class="emi-copy">${currency(Math.round(product.price / 24))}/mo</span>
              </div>
              <p class="detail-tax">(Incl. all taxes)</p>

              ${colorVariants.length ? `
                <div class="variant-block detail-variant-block">
                  <strong>Brand Color</strong>
                  <div class="variant-row">
                    ${colorVariants.map((item) => `<a class="variant-pill dark-pill ${item.slug === product.slug ? "active" : ""}" href="/product/${item.slug}">${escapeHtml(item.color)}</a>`).join("")}
                  </div>
                </div>
              ` : ""}

              ${memoryVariants.length ? `
                <div class="variant-block detail-variant-block">
                  <strong>Internal Storage</strong>
                  <div class="variant-row">
                    ${memoryVariants.map((item) => `<a class="variant-pill dark-pill ${item.slug === product.slug ? "active" : ""}" href="/product/${item.slug}">${escapeHtml(item.memory)}</a>`).join("")}
                  </div>
                </div>
              ` : ""}

              <div class="savings-panel">
                <h2>Super Savings (2 Offers)</h2>
                <div class="offer-stack dark-offers">
                  <article>
                    <strong>HDFC</strong>
                    <span>Instant discount on eligible credit cards. Discounted price applied at checkout.</span>
                  </article>
                  <article>
                    <strong>No-cost EMI</strong>
                    <span>Flexible monthly options available on select bank cards for premium categories.</span>
                  </article>
                </div>
              </div>

              <div class="delivery-box dark-delivery">
                <strong>Delivery at Mumbai, 400049</strong>
                <span>Will be delivered by 16 April 2026.</span>
              </div>

              <div class="inline-features-card" id="key-features">
                <h2>Key Features</h2>
                <ul class="inline-features-list">
                  ${specs.slice(0, 6).map((spec) => `<li>${escapeHtml(spec)}</li>`).join("")}
                </ul>
              </div>

              <div class="buy-strip detail-buy-strip">
                <a class="primary-button large-button buy-now-button" href="/checkout">Buy now</a>
                <button class="ghost-button large-button dark-ghost add-cart-dark" data-add-to-cart='${JSON.stringify({
                  id: product.id,
                  slug: product.slug,
                  name: product.name,
                  price: product.price,
                  image: product.image
                }).replace(/'/g, "&apos;")}'>Add to cart</button>
              </div>
            </div>
          </div>
        </div>

        <section class="section product-lower-grid">
          <article class="panel-card key-features-card">
            <h2>Product Description</h2>
            <p class="detail-description">${escapeHtml(product.description)}</p>
          </article>
          <article class="panel-card specifications-card">
            <h2>More from ${escapeHtml(product.category)}</h2>
            <div class="product-grid compact-grid">
              ${related.map(productCard).join("")}
            </div>
          </article>
        </section>
      </main>
    `
  });
}

function cartPage(user = null) {
  return layout({
    title: "Your Cart | ElectroHub",
    currentPath: "/cart",
    user,
    content: `
      <main class="section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Shopping cart</p>
            <h1 class="page-title">Review your selected products</h1>
          </div>
          <a class="primary-button" href="/checkout">Continue to checkout</a>
        </div>
        <div class="cart-layout">
          <section class="cart-shell" data-cart-items></section>
          <aside class="summary-card">
            <h3>Order summary</h3>
            <div class="summary-line"><span>Items</span><strong data-cart-items-count>0</strong></div>
            <div class="summary-line"><span>Total</span><strong data-cart-total>${currency(0)}</strong></div>
            <a class="primary-button full-width" href="/checkout">Checkout now</a>
          </aside>
        </div>
      </main>
    `
  });
}

function checkoutPage(user = null) {
  return layout({
    title: "Checkout | ElectroHub",
    currentPath: "/cart",
    user,
    content: `
      <main class="section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Checkout</p>
            <h1 class="page-title">Place your order</h1>
            <p class="subtle">Orders are stored in SQLite and can be tracked immediately after purchase.</p>
          </div>
        </div>
        <div class="checkout-layout">
          <form class="form-card" data-checkout-form>
            <label>Full name<input name="customerName" value="${escapeHtml(user?.name || "")}" required></label>
            <label>Email<input type="email" name="email" value="${escapeHtml(user?.email || "")}" required></label>
            <label>Phone<input name="phone" required></label>
            <label>Address<input name="address" required></label>
            <div class="two-col">
              <label>City<input name="city" required></label>
              <label>State<input name="state" required></label>
            </div>
            <label>Pincode<input name="pincode" required></label>
            <button class="primary-button" type="submit">Place order</button>
            <p class="subtle" data-checkout-message></p>
          </form>
          <aside class="summary-card">
            <h3>Your items</h3>
            <div data-checkout-items></div>
            <div class="summary-line total"><span>Total payable</span><strong data-checkout-total>${currency(0)}</strong></div>
          </aside>
        </div>
      </main>
    `
  });
}

function trackPage(prefill = "", user = null) {
  return layout({
    title: "Track Order | ElectroHub",
    currentPath: "/track",
    user,
    content: `
      <main class="section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Order tracking</p>
            <h1 class="page-title">Find your order</h1>
          </div>
        </div>
        <section class="tracker-shell">
          <form class="track-form" action="/track" method="GET">
            <input type="text" name="orderId" value="${escapeHtml(prefill)}" placeholder="Enter order code like ORD-1001">
            <button class="primary-button" type="submit">Track order</button>
          </form>
          ${prefill ? renderTrackResult(prefill) : `<div class="empty-panel">Enter an order ID to view delivery status and purchased items.</div>`}
        </section>
      </main>
    `
  });
}

function renderTrackResult(orderCode) {
  const order = db.prepare("SELECT * FROM orders WHERE order_code = ?").get(orderCode);
  if (!order) {
    return `<div class="empty-panel danger-panel">No order found for ${escapeHtml(orderCode)}.</div>`;
  }

  const items = JSON.parse(order.items_json);
  return `
    <article class="track-card">
      <div class="summary-line"><span>Order ID</span><strong>${escapeHtml(order.order_code)}</strong></div>
      <div class="summary-line"><span>Status</span><strong>${escapeHtml(order.status)}</strong></div>
      <div class="summary-line"><span>Customer</span><strong>${escapeHtml(order.customer_name)}</strong></div>
      <div class="summary-line"><span>Total</span><strong>${currency(order.total)}</strong></div>
      <div class="order-items-list">
        ${items.map((item) => `<div>${escapeHtml(item.name)} × ${item.quantity}</div>`).join("")}
      </div>
    </article>
  `;
}

function orderSuccessPage(code, user = null) {
  return layout({
    title: `${code} | Order Confirmed`,
    currentPath: "/track",
    user,
    content: `
      <main class="section center-panel">
        <div class="success-card">
          <p class="eyebrow">Order placed</p>
          <h1 class="page-title">Your order is confirmed</h1>
          <p class="subtle">Reference: <strong>${escapeHtml(code)}</strong></p>
          <div class="hero-actions">
            <a class="primary-button" href="/track?orderId=${encodeURIComponent(code)}">Track this order</a>
            <a class="ghost-button" href="/products">Continue shopping</a>
          </div>
        </div>
      </main>
    `
  });
}

function authPage({ mode = "register", message = "", email = "" } = {}, user = null) {
  return layout({
    title: "Login | ElectroHub",
    currentPath: "/auth",
    user,
    content: `
      <main class="section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Account access</p>
            <h1 class="page-title">Login or create your account</h1>
            <p class="subtle">OTP verification is enabled in development mode. The generated OTP is shown after you request it.</p>
          </div>
        </div>
        <div class="auth-layout">
          <form class="form-card" method="POST" action="/auth/request-otp">
            <input type="hidden" name="mode" value="register">
            <label>Full name<input name="name" required></label>
            <label>Email<input type="email" name="email" value="${escapeHtml(email)}" required></label>
            <label>Password<input type="password" name="password" required></label>
            <button class="primary-button" type="submit">Create account & send OTP</button>
          </form>
          <div class="auth-side">
            <form class="form-card" method="POST" action="/auth/request-otp">
              <input type="hidden" name="mode" value="login">
              <label>Email<input type="email" name="email" value="${escapeHtml(email)}" required></label>
              <label>Password<input type="password" name="password" required></label>
              <button class="primary-button" type="submit">Login & send OTP</button>
            </form>
            <form class="form-card" method="POST" action="/auth/verify-otp">
              <input type="hidden" name="email" value="${escapeHtml(email)}">
              <label>OTP code<input name="otp" maxlength="6" required></label>
              <button class="ghost-button" type="submit">Verify OTP</button>
            </form>
            ${message ? `<div class="empty-panel auth-message">${message}</div>` : ""}
          </div>
        </div>
      </main>
    `
  });
}

function accountPage(user) {
  const orders = getOrdersByEmail(user.email);
  return layout({
    title: "My Account | ElectroHub",
    currentPath: "/account",
    user,
    content: `
      <main class="section">
        <div class="section-head">
          <div>
            <p class="eyebrow">My account</p>
            <h1 class="page-title">Welcome, ${escapeHtml(user.name)}</h1>
            <p class="subtle">${escapeHtml(user.email)} · ${user.verified ? "Verified account" : "Verification pending"}</p>
          </div>
          <form method="POST" action="/auth/logout">
            <button class="ghost-button" type="submit">Logout</button>
          </form>
        </div>
        <div class="stats-grid">
          <article class="stat-card"><span>Login method</span><strong>Email + OTP</strong></article>
          <article class="stat-card"><span>Account status</span><strong>${user.verified ? "Verified" : "Pending"}</strong></article>
          <article class="stat-card"><span>Storage backend</span><strong>${MONGODB_URI ? "MongoDB mirror" : "SQLite local"}</strong></article>
          <article class="stat-card"><span>Orders placed</span><strong>${orders.length}</strong></article>
        </div>
        <section class="panel-card">
          <h2>My orders</h2>
          ${orders.length
            ? orders.map((order) => `
              <div class="summary-line border-row">
                <span>${escapeHtml(order.order_code)} · ${new Date(order.created_at).toLocaleDateString("en-IN")}</span>
                <strong>${currency(order.total)} · ${escapeHtml(order.status)}</strong>
              </div>
            `).join("")
            : `<div class="empty-panel">No orders yet. Start shopping to see your order history here.</div>`}
        </section>
      </main>
    `
  });
}

function adminPage(user = null) {
  const stats = {
    products: db.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    categories: db.prepare("SELECT COUNT(DISTINCT category) AS count FROM products").get().count,
    orders: db.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    revenue: db.prepare("SELECT COALESCE(SUM(total), 0) AS total FROM orders").get().total
  };
  const latestOrders = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 8").all();
  const lowStock = db.prepare("SELECT * FROM products WHERE stock < 10 ORDER BY stock ASC LIMIT 10").all();
  const editSlug = user && user.__editSlug ? user.__editSlug : "";
  const editProduct = editSlug ? normalizeProduct(db.prepare("SELECT * FROM products WHERE slug = ?").get(editSlug)) : null;
  const manageableProducts = db.prepare("SELECT * FROM products ORDER BY id DESC LIMIT 20").all().map(normalizeProduct);

  return layout({
    title: "Admin Overview | ElectroHub",
    currentPath: "/admin",
    user,
    content: `
      <main class="section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Admin overview</p>
            <h1 class="page-title">Store database summary</h1>
            <p class="subtle">Admin login: admin@electrohub.local / Admin@123</p>
          </div>
        </div>
        <div class="stats-grid">
          <article class="stat-card"><span>Products</span><strong>${stats.products}</strong></article>
          <article class="stat-card"><span>Categories</span><strong>${stats.categories}</strong></article>
          <article class="stat-card"><span>Orders</span><strong>${stats.orders}</strong></article>
          <article class="stat-card"><span>Revenue</span><strong>${currency(stats.revenue)}</strong></article>
        </div>

        <section class="panel-card">
          <h2>${editProduct ? "Edit product" : "Add product"}</h2>
          <form class="form-card admin-product-form" method="POST" action="/admin/products">
            <input type="hidden" name="existingSlug" value="${escapeHtml(editProduct?.slug || "")}">
            <label>Product name<input name="name" value="${escapeHtml(editProduct?.name || "")}" required></label>
            <div class="two-col">
              <label>Brand<input name="brand" value="${escapeHtml(editProduct?.brand || "")}" required></label>
              <label>Category<input name="category" value="${escapeHtml(editProduct?.category || "")}" required></label>
            </div>
            <div class="two-col">
              <label>Price<input name="price" type="number" value="${escapeHtml(editProduct?.price || "")}" required></label>
              <label>Original price<input name="originalPrice" type="number" value="${escapeHtml(editProduct?.original_price || "")}" required></label>
            </div>
            <div class="two-col">
              <label>Rating<input name="rating" type="number" step="0.1" value="${escapeHtml(editProduct?.rating || "4.2")}" required></label>
              <label>Reviews<input name="reviews" type="number" value="${escapeHtml(editProduct?.reviews || "100")}" required></label>
            </div>
            <div class="two-col">
              <label>Stock<input name="stock" type="number" value="${escapeHtml(editProduct?.stock || "10")}" required></label>
              <label>Badge<input name="badge" value="${escapeHtml(editProduct?.badge || "")}" required></label>
            </div>
            <label>Description<input name="description" value="${escapeHtml(editProduct?.description || "")}" required></label>
            <label>Images
              <textarea name="images" rows="4" placeholder="One image path or URL per line">${escapeHtml((editProduct?.images || []).join("\n"))}</textarea>
            </label>
            <label>Specs
              <textarea name="specs" rows="4" placeholder="One spec per line">${escapeHtml((editProduct?.specs || []).join("\n"))}</textarea>
            </label>
            <div class="buy-strip">
              <button class="primary-button" type="submit">${editProduct ? "Update product" : "Add product"}</button>
              ${editProduct ? `<a class="ghost-button" href="/admin">Cancel edit</a>` : ""}
            </div>
          </form>
        </section>

        <div class="dashboard-grid">
          <section class="panel-card">
            <h2>Recent orders</h2>
            ${latestOrders.length ? latestOrders.map((order) => `
              <div class="summary-line border-row">
                <span>${escapeHtml(order.order_code)} · ${escapeHtml(order.customer_name)}</span>
                <strong>${currency(order.total)} · ${escapeHtml(order.status)}</strong>
              </div>
            `).join("") : `<div class="empty-panel">No orders yet.</div>`}
          </section>
          <section class="panel-card">
            <h2>Low stock items</h2>
            ${lowStock.map((product) => `
              <div class="summary-line border-row">
                <span>${escapeHtml(product.name)}</span>
                <strong>${product.stock} left</strong>
              </div>
            `).join("")}
          </section>
        </div>

        <section class="panel-card">
          <h2>Manage products</h2>
          ${manageableProducts.map((product) => `
            <div class="summary-line border-row">
              <span>${escapeHtml(product.name)}</span>
              <div class="admin-actions">
                <a class="ghost-button" href="/admin?edit=${encodeURIComponent(product.slug)}">Edit</a>
                <form method="POST" action="/admin/products/delete">
                  <input type="hidden" name="slug" value="${escapeHtml(product.slug)}">
                  <button class="ghost-button danger-button" type="submit">Delete</button>
                </form>
              </div>
            </div>
          `).join("")}
        </section>
      </main>
    `
  });
}

function notFoundPage(user = null) {
  return layout({
    title: "Page Not Found",
    user,
    content: `
      <main class="section center-panel">
        <div class="success-card">
          <h1 class="page-title">Page not found</h1>
          <a class="primary-button" href="/">Go home</a>
        </div>
      </main>
    `
  });
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function html(res, statusCode, markup) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(markup);
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  };

  if (!filePath.startsWith(PUBLIC_DIR)) {
    html(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      html(res, 404, "Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function parseFormEncoded(raw) {
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const currentUser = await getCurrentUser(req);

  if (pathname.startsWith("/public/")) {
    serveStatic(res, path.join(PUBLIC_DIR, pathname.replace("/public/", "")));
    return;
  }

  if (req.method === "GET" && pathname === "/") {
    html(res, 200, homePage(currentUser));
    return;
  }

  if (req.method === "GET" && pathname === "/products") {
    html(res, 200, productsPage(url, "", currentUser));
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/category/")) {
    const categorySlug = pathname.split("/").pop();
    const category = getCategories().find((item) => slugify(item.category) === categorySlug)?.category;
    html(res, 200, category ? productsPage(url, category, currentUser) : notFoundPage(currentUser));
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/product/")) {
    html(res, 200, productDetailPage(pathname.split("/").pop(), currentUser));
    return;
  }

  if (req.method === "GET" && pathname === "/cart") {
    html(res, 200, cartPage(currentUser));
    return;
  }

  if (req.method === "GET" && pathname === "/checkout") {
    html(res, 200, checkoutPage(currentUser));
    return;
  }

  if (req.method === "GET" && pathname === "/track") {
    html(res, 200, trackPage(url.searchParams.get("orderId") || "", currentUser));
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/order/")) {
    html(res, 200, orderSuccessPage(pathname.split("/").pop(), currentUser));
    return;
  }

  if (req.method === "GET" && pathname === "/admin") {
    if (!isAdmin(currentUser)) {
      res.writeHead(302, { Location: "/auth?message=Admin+login+required" });
      res.end();
      return;
    }
    const adminUser = { ...currentUser, __editSlug: url.searchParams.get("edit") || "" };
    html(res, 200, adminPage(adminUser));
    return;
  }

  if (req.method === "GET" && pathname === "/auth") {
    html(res, 200, authPage({
      message: url.searchParams.get("message") || "",
      email: url.searchParams.get("email") || ""
    }, currentUser));
    return;
  }

  if (req.method === "GET" && pathname === "/account") {
    if (!currentUser) {
      res.writeHead(302, { Location: "/auth?message=Please+login+first" });
      res.end();
      return;
    }
    html(res, 200, accountPage(currentUser));
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/api/orders/")) {
    const orderCode = pathname.split("/").pop();
    const order = db.prepare("SELECT * FROM orders WHERE order_code = ?").get(orderCode);
    if (!order) {
      json(res, 404, { error: "Order not found" });
      return;
    }
    json(res, 200, { ...order, items: JSON.parse(order.items_json) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/orders") {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || "{}");
      const required = ["customerName", "email", "phone", "address", "city", "state", "pincode", "items"];

      for (const key of required) {
        if (!payload[key] || (Array.isArray(payload[key]) && payload[key].length === 0)) {
          json(res, 400, { error: `Missing ${key}` });
          return;
        }
      }

      const items = payload.items.map((item) => {
        const product = db.prepare("SELECT id, name, price, stock FROM products WHERE id = ?").get(item.id);
        if (!product) {
          throw new Error(`Product ${item.id} not found`);
        }
        const quantity = Math.max(1, Number(item.quantity || 1));
        if (quantity > product.stock) {
          throw new Error(`Only ${product.stock} units left for ${product.name}`);
        }
        return { id: product.id, name: product.name, price: product.price, quantity };
      });

      const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const orderCode = `ORD-${1000 + Number(db.prepare("SELECT COUNT(*) AS count FROM orders").get().count) + 1}`;
      const insert = db.prepare(`
        INSERT INTO orders
        (order_code, customer_name, email, phone, address, city, state, pincode, status, total, items_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)
      `);

      insert.run(
        orderCode,
        payload.customerName,
        String(payload.email).toLowerCase(),
        payload.phone,
        payload.address,
        payload.city,
        payload.state,
        payload.pincode,
        total,
        JSON.stringify(items),
        new Date().toISOString()
      );

      const reduceStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
      for (const item of items) {
        reduceStock.run(item.quantity, item.id);
      }

      json(res, 201, { orderCode });
      return;
    } catch (error) {
      json(res, 400, { error: error.message || "Could not create order" });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/auth/request-otp") {
    const body = parseFormEncoded(await readBody(req));
    const mode = body.mode === "login" ? "login" : "register";
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();

    if (!email || !password || (mode === "register" && !name)) {
      res.writeHead(302, { Location: `/auth?message=${encodeURIComponent("Please complete all required fields.")}&email=${encodeURIComponent(email)}` });
      res.end();
      return;
    }

    let user = await dataLayer.getUserByEmail(email);
    if (mode === "register") {
      if (user) {
        res.writeHead(302, { Location: `/auth?message=${encodeURIComponent("An account with this email already exists.")}&email=${encodeURIComponent(email)}` });
        res.end();
        return;
      }
      user = await dataLayer.createUser({ name, email, password });
    } else {
      if (!user || !verifyPassword(password, user.password_hash)) {
        res.writeHead(302, { Location: `/auth?message=${encodeURIComponent("Invalid email or password.")}&email=${encodeURIComponent(email)}` });
        res.end();
        return;
      }
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString();
    await dataLayer.saveOtp({ email, code: otp, purpose: mode, expiresAt });
    const emailResult = await sendOtpEmail(email, otp);
    const message = emailResult.sent
      ? `OTP sent to ${email}. Please check your inbox.`
      : `OTP sent for ${mode}. Demo code: ${otp}`;
    res.writeHead(302, { Location: `/auth?message=${encodeURIComponent(message)}&email=${encodeURIComponent(email)}` });
    res.end();
    return;
  }

  if (req.method === "POST" && pathname === "/auth/verify-otp") {
    const body = parseFormEncoded(await readBody(req));
    const email = String(body.email || "").trim().toLowerCase();
    const otp = String(body.otp || "").trim();

    if (!email || !otp) {
      res.writeHead(302, { Location: "/auth?message=Enter+email+and+OTP" });
      res.end();
      return;
    }

    const loginOk = await dataLayer.verifyOtp({ email, code: otp, purpose: "login" });
    const registerOk = loginOk ? false : await dataLayer.verifyOtp({ email, code: otp, purpose: "register" });
    const passed = loginOk || registerOk;

    if (!passed) {
      res.writeHead(302, { Location: `/auth?message=${encodeURIComponent("Invalid or expired OTP.")}&email=${encodeURIComponent(email)}` });
      res.end();
      return;
    }

    await dataLayer.markUserVerified(email);
    const session = await dataLayer.createSession(email);
    setSessionCookie(res, session.token, session.expiresAt);
    res.writeHead(302, { Location: "/account" });
    res.end();
    return;
  }

  if (req.method === "POST" && pathname === "/auth/logout") {
    const cookies = parseCookies(req);
    if (cookies.session_token) {
      await dataLayer.deleteSession(cookies.session_token);
    }
    clearSessionCookie(res);
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }

  if (req.method === "POST" && pathname === "/admin/products") {
    if (!isAdmin(currentUser)) {
      res.writeHead(302, { Location: "/auth?message=Admin+login+required" });
      res.end();
      return;
    }
    const body = parseFormEncoded(await readBody(req));
    const existingSlug = String(body.existingSlug || "").trim();
    const name = String(body.name || "").trim();
    const brand = String(body.brand || "").trim();
    const category = String(body.category || "").trim();
    const price = Number(body.price || 0);
    const originalPrice = Number(body.originalPrice || 0);
    const rating = Number(body.rating || 4.2);
    const reviews = Number(body.reviews || 100);
    const stock = Number(body.stock || 0);
    const badge = String(body.badge || "").trim();
    const description = String(body.description || "").trim();
    const images = parseListField(body.images);
    const specs = parseListField(body.specs);
    const slug = slugify(name);

    if (!name || !brand || !category || !price || !originalPrice || !images.length || !specs.length) {
      res.writeHead(302, { Location: existingSlug ? `/admin?edit=${encodeURIComponent(existingSlug)}` : "/admin" });
      res.end();
      return;
    }

    if (existingSlug) {
      db.prepare(`
        UPDATE products
        SET slug = ?, name = ?, brand = ?, category = ?, price = ?, original_price = ?, rating = ?, reviews = ?, stock = ?, image = ?, images_json = ?, badge = ?, description = ?, specs_json = ?
        WHERE slug = ?
      `).run(
        slug, name, brand, category, price, originalPrice, rating, reviews, stock,
        images[0], JSON.stringify(images), badge, description, JSON.stringify(specs), existingSlug
      );
    } else {
      db.prepare(`
        INSERT INTO products (slug, name, brand, category, price, original_price, rating, reviews, stock, image, images_json, badge, description, specs_json, featured)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        slug, name, brand, category, price, originalPrice, rating, reviews, stock,
        images[0], JSON.stringify(images), badge, description, JSON.stringify(specs)
      );
    }

    res.writeHead(302, { Location: "/admin" });
    res.end();
    return;
  }

  if (req.method === "POST" && pathname === "/admin/products/delete") {
    if (!isAdmin(currentUser)) {
      res.writeHead(302, { Location: "/auth?message=Admin+login+required" });
      res.end();
      return;
    }
    const body = parseFormEncoded(await readBody(req));
    const slug = String(body.slug || "").trim();
    if (slug) {
      db.prepare("DELETE FROM products WHERE slug = ?").run(slug);
    }
    res.writeHead(302, { Location: "/admin" });
    res.end();
    return;
  }

  html(res, 404, notFoundPage(currentUser));
});

async function start() {
  dataLayer = await createDataLayer(db, MONGODB_URI);
  server.listen(PORT, () => {
    console.log(`ElectroHub running at http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { DatabaseSync } = require("node:sqlite");
const crypto = require("crypto");
const { createDataLayer, verifyPassword, hashPassword } = require("./data-layer");
const { sendOtpEmail } = require("./mailer");
const productsV2 = require("./data/products-v2.json");

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

  const allowedCategories = ["Laptops", "Mobiles", "Headphones", "Mouse"];
  const hasLegacyCategories = existing
    ? db.prepare(`SELECT COUNT(*) AS count FROM products WHERE category NOT IN ('Laptops','Mobiles','Headphones','Mouse')`).get().count > 0
    : false;
  if (existing >= 120 && !hasPlaceholderNames && !hasRemoteImages && !hasLegacyCategories) {
    return;
  }
  void allowedCategories;

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
  return buildOverhaulSeedProducts();
}

function buildSeedProductsLegacy_UNUSED() {
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

function buildOverhaulSeedProducts() {
  const IMG = (cat, n) => `/public/assets/products-v3/${cat}/${cat}-${String(n).padStart(2, "0")}.jpg`;
  const images3 = (cat, n) => {
    const a = n, b = ((n % 30) + 1), c = (((n + 1) % 30) + 1);
    return [IMG(cat, a), IMG(cat, b), IMG(cat, c)];
  };
  const rating = (i) => Number((3.6 + ((i * 37) % 14) * 0.1).toFixed(1));
  const reviews = (i) => 50 + ((i * 131) % 9450);
  const stock = (i) => (i * 7) % 151;

  const products = [];

  // ===== LAPTOPS =====
  const laptopData = [
    ["Apple", "MacBook Air M3", [13.6, 15.3], "macOS Sequoia", "Apple M3", ["Midnight", "Silver", "Space Gray"], [104990, 124990, 149990], "Apple Silicon"],
    ["Apple", "MacBook Pro 14 M3 Pro", [14.2], "macOS Sequoia", "Apple M3 Pro", ["Space Black", "Silver"], [199990, 234990], "Pro"],
    ["Dell", "XPS 13 Plus", [13.4], "Windows 11 Home", "Intel Core Ultra 7", ["Platinum", "Graphite"], [129990], "New"],
    ["Dell", "Inspiron 15 3520", [15.6], "Windows 11 Home", "Intel Core i5-1235U", ["Mercury Gray", "Silver"], [54990, 62990], "Best Seller"],
    ["Dell", "Alienware m16 R2", [16], "Windows 11 Home", "Intel Core i9-14900HX", ["Dark Metallic Moon"], [219990], "Gaming"],
    ["HP", "Pavilion 14", [14], "Windows 11 Home", "AMD Ryzen 7 7730U", ["Silver", "Pure White"], [64990], "Student Pick"],
    ["HP", "Victus 15", [15.6], "Windows 11 Home", "Intel Core i5-13420H", ["Mica Silver", "Shadow Black"], [72990], "Gaming"],
    ["HP", "Omen 16", [16.1], "Windows 11 Home", "Intel Core i7-13700HX", ["Shadow Black"], [139990], "Gaming"],
    ["HP", "EliteBook 840 G10", [14], "Windows 11 Pro", "Intel Core i7-1355U", ["Silver"], [109990], "Business"],
    ["Lenovo", "IdeaPad Slim 3", [15.6], "Windows 11 Home", "Intel Core i5-13420H", ["Arctic Grey", "Cosmic Black"], [48990, 56990], "Value"],
    ["Lenovo", "ThinkPad X1 Carbon Gen 12", [14], "Windows 11 Pro", "Intel Core Ultra 7 155H", ["Shadow Black"], [189990], "Business"],
    ["Lenovo", "Legion 5 Pro", [16], "Windows 11 Home", "AMD Ryzen 7 7745HX", ["Storm Grey"], [129990], "Gaming"],
    ["Lenovo", "Yoga Slim 7i", [14], "Windows 11 Home", "Intel Core Ultra 5", ["Cosmic Blue"], [84990], "Creator"],
    ["ASUS", "Zenbook 14 OLED", [14], "Windows 11 Home", "Intel Core Ultra 7", ["Jade Black", "Silver"], [109990], "OLED"],
    ["ASUS", "VivoBook 15", [15.6], "Windows 11 Home", "Intel Core i3-1215U", ["Transparent Silver"], [35990], "Budget"],
    ["ASUS", "ROG Strix G16", [16], "Windows 11 Home", "Intel Core i7-13650HX", ["Eclipse Gray"], [134990], "Gaming"],
    ["ASUS", "TUF Gaming A15", [15.6], "Windows 11 Home", "AMD Ryzen 7 7735HS", ["Mecha Gray"], [79990], "Gaming"],
    ["Acer", "Aspire 5", [15.6], "Windows 11 Home", "Intel Core i5-1335U", ["Pure Silver"], [52990], "Best Seller"],
    ["Acer", "Swift Go 14", [14], "Windows 11 Home", "Intel Core Ultra 5", ["Pure Silver"], [69990], "New"],
    ["Acer", "Predator Helios Neo 16", [16], "Windows 11 Home", "Intel Core i7-13700HX", ["Abyssal Black"], [119990], "Gaming"],
    ["MSI", "Modern 14", [14], "Windows 11 Home", "Intel Core i5-1335U", ["Urban Silver"], [55990], "Value"],
    ["MSI", "Katana 15", [15.6], "Windows 11 Home", "Intel Core i7-13620H", ["Black"], [94990], "Gaming"],
    ["MSI", "Raider GE78 HX", [17], "Windows 11 Home", "Intel Core i9-14900HX", ["Core Black"], [249990], "Gaming"],
    ["Razer", "Blade 14", [14], "Windows 11 Home", "AMD Ryzen 9 7940HS", ["Cosmic Black"], [199990], "Gaming"],
    ["Razer", "Blade 16", [16], "Windows 11 Home", "Intel Core i9-13950HX", ["Cosmic Black"], [239990], "Gaming"],
    ["Microsoft", "Surface Laptop 6", [13.5, 15], "Windows 11 Home", "Intel Core Ultra 5", ["Platinum", "Black"], [124990, 149990], "New"],
    ["Microsoft", "Surface Laptop Go 3", [12.4], "Windows 11 Home", "Intel Core i5-1235U", ["Sage", "Platinum"], [89990], "Compact"],
    ["Apple", "MacBook Pro 16 M3 Max", [16.2], "macOS Sequoia", "Apple M3 Max", ["Space Black"], [249990], "Pro"],
    ["Dell", "Latitude 7440", [14], "Windows 11 Pro", "Intel Core i7-1365U", ["Titan Gray"], [129990], "Business"],
    ["HP", "Spectre x360 14", [13.5], "Windows 11 Home", "Intel Core Ultra 7", ["Nightfall Black", "Slate Blue"], [154990], "Convertible"]
  ];
  const rams = ["8GB RAM", "16GB RAM", "32GB RAM"];
  const storages = ["256GB SSD", "512GB SSD", "1TB SSD"];

  for (let i = 0; i < 30; i++) {
    const [brand, model, sizes, os, cpu, colors, prices, badge] = laptopData[i];
    const ram = rams[i % rams.length];
    const storage = storages[i % storages.length];
    const size = sizes[i % sizes.length];
    const color = colors[i % colors.length];
    const price = prices[i % prices.length];
    const originalPrice = Math.round(price * 1.12);
    const name = `${brand} ${model} (${size}", ${ram}, ${storage}, ${color})`;
    products.push({
      slug: slugify(name + "-" + i),
      name, brand, category: "Laptops", price, originalPrice,
      rating: rating(i), reviews: reviews(i), stock: stock(i),
      images: images3("laptops", i + 1), badge,
      description: `${brand} ${model} delivers reliable ${cpu} performance in a ${size}-inch chassis. Finished in ${color}, it pairs ${ram} with a fast ${storage} drive for work, study, and entertainment on the go.`,
      specs: [ram, storage, cpu, `${size}-inch display`, os],
      featured: i < 4
    });
  }

  // ===== MOBILES =====
  const mobileData = [
    ["Apple", "iPhone 15 Pro Max", 6.7, ["Titanium Black", "Titanium White", "Titanium Blue"], [159900, 169900, 189900], "Flagship"],
    ["Apple", "iPhone 15", 6.1, ["Pink", "Blue", "Midnight"], [69900, 79900], "Best Seller"],
    ["Apple", "iPhone 14", 6.1, ["Midnight", "Starlight"], [59900], "Value"],
    ["Samsung", "Galaxy S24 Ultra", 6.8, ["Phantom Blue", "Titanium Black", "Lavender"], [129999, 144999], "5G"],
    ["Samsung", "Galaxy S24", 6.2, ["Cobalt Violet", "Obsidian", "Pearl White"], [74999, 84999], "5G"],
    ["Samsung", "Galaxy A55 5G", 6.6, ["Navy", "Lilac"], [39999], "5G"],
    ["Samsung", "Galaxy M15 5G", 6.5, ["Celestine Blue", "Stone Gray"], [14999], "Budget"],
    ["OnePlus", "12", 6.82, ["Flowy Emerald", "Silky Black"], [64999, 69999], "Flagship"],
    ["OnePlus", "12R", 6.78, ["Cool Blue", "Iron Gray"], [39999, 42999], "Performance"],
    ["OnePlus", "Nord CE4", 6.7, ["Celadon Marble", "Dark Chrome"], [24999], "5G"],
    ["Xiaomi", "14 Ultra", 6.73, ["Black", "White"], [99999], "Flagship"],
    ["Xiaomi", "Redmi Note 13 Pro+", 6.67, ["Fusion Black", "Fusion Purple"], [31999], "5G"],
    ["Xiaomi", "Redmi 13C", 6.74, ["Starfrost White", "Midnight Black"], [12999], "Budget"],
    ["Google", "Pixel 8 Pro", 6.7, ["Obsidian", "Porcelain", "Bay"], [106999], "Flagship"],
    ["Google", "Pixel 8", 6.2, ["Hazel", "Obsidian", "Rose Gold"], [74999], "AI Camera"],
    ["Google", "Pixel 7a", 6.1, ["Charcoal", "Sea"], [43999], "Value"],
    ["Realme", "GT 6", 6.78, ["Fluid Silver", "Razor Green"], [40999], "5G"],
    ["Realme", "Narzo 70 Pro 5G", 6.67, ["Glass Gold", "Glass Green"], [19999], "5G"],
    ["Vivo", "X100 Pro", 6.78, ["Asteroid Black", "Titanium Gray"], [89999], "Camera"],
    ["Vivo", "V30 Pro 5G", 6.78, ["Peacock Green", "Classic Black"], [41999], "5G"],
    ["Vivo", "Y28s 5G", 6.68, ["Vintage Red", "Twinkling Purple"], [16999], "5G"],
    ["Oppo", "Find X7 Ultra", 6.82, ["Ocean Blue", "Tailored Black"], [109999], "Camera"],
    ["Oppo", "Reno 11 Pro 5G", 6.7, ["Pearl White", "Rock Grey"], [39999], "5G"],
    ["Oppo", "A79 5G", 6.72, ["Mystery Black", "Glowing Green"], [18999], "5G"],
    ["Nothing", "Phone (2a)", 6.7, ["Black", "White", "Milk"], [23999], "Design"],
    ["Nothing", "Phone (2)", 6.7, ["Dark Gray", "White"], [44999], "Design"],
    ["Apple", "iPhone SE (3rd Gen)", 4.7, ["Midnight", "Starlight", "Red"], [43900], "Compact"],
    ["Samsung", "Galaxy Z Flip5", 6.7, ["Mint", "Cream", "Graphite"], [99999], "Foldable"],
    ["Samsung", "Galaxy Z Fold5", 7.6, ["Icy Blue", "Phantom Black"], [154999], "Foldable"],
    ["Apple", "iPhone 15 Pro", 6.1, ["Natural Titanium", "Blue Titanium", "White Titanium"], [134900, 144900], "Flagship"]
  ];
  const phoneRams = ["6GB RAM", "8GB RAM", "12GB RAM"];
  const phoneStorages = ["128GB", "256GB", "512GB", "1TB"];
  const cams = ["50MP", "108MP", "200MP", "48MP"];

  for (let i = 0; i < 30; i++) {
    const [brand, model, screen, colors, prices, badge] = mobileData[i];
    const ram = phoneRams[i % phoneRams.length];
    const storage = phoneStorages[i % phoneStorages.length];
    const color = colors[i % colors.length];
    const price = prices[i % prices.length];
    const originalPrice = Math.round(price * 1.10);
    const camera = cams[i % cams.length];
    const network = price < 20000 && i % 5 === 0 ? "4G LTE" : "5G";
    const name = `${brand} ${model} (${ram}, ${storage}, ${color})`;
    products.push({
      slug: slugify(name + "-" + i),
      name, brand, category: "Mobiles", price, originalPrice,
      rating: rating(i + 3), reviews: reviews(i + 7), stock: stock(i + 2),
      images: images3("mobiles", i + 1), badge,
      description: `${brand} ${model} combines a ${screen}-inch display with ${camera} main camera and ${network} connectivity. Finished in ${color} with ${ram} and ${storage} storage for smooth everyday use.`,
      specs: [ram, `${storage} Storage`, `${screen}-inch display`, network, `${camera} Camera`],
      featured: i < 4
    });
  }

  // ===== HEADPHONES =====
  const headphoneData = [
    ["Sony", "WH-1000XM5", "Wireless", "ANC", "Black", 29990, 5, "Over-Ear"],
    ["Sony", "WH-CH720N", "Wireless", "ANC", "White", 9990, 4, "Over-Ear"],
    ["Sony", "MDR-ZX110", "Wired", "no-ANC", "Black", 899, 0, "On-Ear"],
    ["Sony", "WF-1000XM5", "Wireless", "ANC", "Midnight", 24990, 6, "In-Ear"],
    ["Bose", "QuietComfort Ultra", "Wireless", "ANC", "Black", 44990, 6, "Over-Ear"],
    ["Bose", "QuietComfort 45", "Wireless", "ANC", "White", 32900, 5, "Over-Ear"],
    ["Bose", "SoundLink 2", "Wireless", "no-ANC", "Navy Blue", 24900, 4, "On-Ear"],
    ["Apple", "AirPods Pro 2 (USB-C)", "Wireless", "ANC", "White", 24900, 6, "In-Ear"],
    ["Apple", "AirPods Max", "Wireless", "ANC", "Midnight", 59900, 5, "Over-Ear"],
    ["Apple", "EarPods USB-C", "Wired", "no-ANC", "White", 1900, 0, "In-Ear"],
    ["JBL", "Tune 760NC", "Wireless", "ANC", "Black", 7999, 4, "Over-Ear"],
    ["JBL", "Live 770NC", "Wireless", "ANC", "Rose Gold", 14999, 5, "Over-Ear"],
    ["JBL", "Tune 510BT", "Wireless", "no-ANC", "Black", 2999, 2, "On-Ear"],
    ["JBL", "Quantum 100", "Wired", "no-ANC", "Black", 2499, 0, "Over-Ear"],
    ["Sennheiser", "Momentum 4", "Wireless", "ANC", "Black", 34990, 6, "Over-Ear"],
    ["Sennheiser", "HD 450BT", "Wireless", "ANC", "Black", 12990, 3, "Over-Ear"],
    ["Sennheiser", "HD 206", "Wired", "no-ANC", "Black", 1890, 0, "Over-Ear"],
    ["Audio-Technica", "ATH-M50xBT2", "Wireless", "no-ANC", "Black", 19990, 5, "Over-Ear"],
    ["Audio-Technica", "ATH-M20x", "Wired", "no-ANC", "Black", 3490, 0, "Over-Ear"],
    ["Audio-Technica", "ATH-S300BT", "Wireless", "ANC", "White", 9990, 6, "Over-Ear"],
    ["Skullcandy", "Crusher Evo", "Wireless", "no-ANC", "Black", 12999, 4, "Over-Ear"],
    ["Skullcandy", "Hesh ANC", "Wireless", "ANC", "Black", 10999, 2, "Over-Ear"],
    ["boAt", "Rockerz 450", "Wireless", "no-ANC", "Black", 1499, 1, "On-Ear"],
    ["boAt", "Nirvana 751 ANC", "Wireless", "ANC", "Navy Blue", 2999, 3, "Over-Ear"],
    ["boAt", "BassHeads 100", "Wired", "no-ANC", "Black", 349, 0, "In-Ear"],
    ["boAt", "Airdopes 141", "Wireless", "no-ANC", "White", 1299, 1, "In-Ear"],
    ["HyperX", "Cloud III", "Wired", "no-ANC", "Red", 7499, 0, "Over-Ear"],
    ["HyperX", "Cloud Stinger 2", "Wireless", "no-ANC", "Black", 9499, 2, "Over-Ear"],
    ["Sony", "WH-XB910N Extra Bass", "Wireless", "ANC", "Midnight", 13990, 5, "Over-Ear"],
    ["JBL", "Endurance Run 2", "Wired", "no-ANC", "Black", 799, 0, "In-Ear"]
  ];
  const driverSizes = ["30mm", "40mm", "50mm"];

  for (let i = 0; i < 30; i++) {
    const [brand, model, connType, anc, color, price, battery, form] = headphoneData[i];
    const driver = driverSizes[i % driverSizes.length];
    const originalPrice = Math.round(price * 1.15);
    const badge = connType === "Wireless" ? (anc === "ANC" ? "ANC" : "Wireless") : "Wired";
    const name = `${brand} ${model} ${form} Headphones (${color})`;
    const battSpec = connType === "Wireless" ? `${battery * 10}h Battery` : "Wired - no battery";
    products.push({
      slug: slugify(name + "-" + i),
      name, brand, category: "Headphones", price, originalPrice,
      rating: rating(i + 5), reviews: reviews(i + 11), stock: stock(i + 3),
      images: images3("headphones", i + 1), badge,
      description: `${brand} ${model} offers tuned sound with a ${driver} driver and ${form.toLowerCase()} comfort. ${connType} connectivity with ${anc === "ANC" ? "active noise cancellation" : "ambient listening"} for daily use.`,
      specs: [connType, anc === "ANC" ? "Active Noise Cancellation" : "No ANC", battSpec, `${driver} Driver`, form],
      featured: i < 4
    });
  }

  // ===== MOUSE =====
  const mouseData = [
    ["Logitech", "MX Master 3S", "Wireless", "Graphite", 8495, 8000, 7, "ergonomic"],
    ["Logitech", "MX Anywhere 3S", "Wireless", "Graphite", 7495, 8000, 6, "office"],
    ["Logitech", "G502 Hero", "Wired", "Black", 3995, 25600, 11, "gaming"],
    ["Logitech", "G Pro X Superlight 2", "Wireless", "Black", 14995, 32000, 5, "gaming"],
    ["Logitech", "M221 Silent", "Wireless", "Black", 1195, 1000, 3, "office"],
    ["Logitech", "B100", "Wired", "Black", 599, 800, 3, "office"],
    ["Razer", "DeathAdder V3 Pro", "Wireless", "Black", 14999, 30000, 5, "gaming"],
    ["Razer", "Basilisk V3", "Wired", "Black", 5499, 26000, 11, "gaming"],
    ["Razer", "Viper 8K", "Wired", "White", 6999, 20000, 8, "gaming"],
    ["Razer", "Orochi V2", "Wireless", "Black", 5499, 18000, 6, "gaming"],
    ["Corsair", "M65 RGB Ultra", "Wired", "Black", 6999, 26000, 8, "gaming"],
    ["Corsair", "Dark Core RGB Pro", "Wireless", "Black", 11999, 18000, 8, "gaming"],
    ["Corsair", "Harpoon RGB Pro", "Wired", "Black", 2999, 12000, 6, "gaming"],
    ["HP", "X1000", "Wired", "Black", 449, 1600, 3, "office"],
    ["HP", "Z3700", "Wireless", "Silver", 1099, 1200, 3, "office"],
    ["HP", "Omen Vector Essential", "Wired", "Black", 1999, 7200, 6, "gaming"],
    ["Dell", "MS3320W", "Wireless", "Black", 1799, 1600, 3, "office"],
    ["Dell", "MS116", "Wired", "Black", 499, 1000, 3, "office"],
    ["Dell", "Alienware AW610M", "Wireless", "Black", 6999, 16000, 7, "gaming"],
    ["Microsoft", "Surface Mouse", "Wireless", "White", 2999, 1800, 3, "office"],
    ["Microsoft", "Bluetooth Ergonomic Mouse", "Wireless", "Graphite", 3499, 2400, 5, "ergonomic"],
    ["Microsoft", "Classic IntelliMouse", "Wired", "Gray", 2499, 3200, 5, "office"],
    ["Zebronics", "Zeb-Transformer-M", "Wired", "Black", 299, 3200, 7, "gaming"],
    ["Zebronics", "Zeb-Dash Plus", "Wired", "Black", 199, 1000, 3, "office"],
    ["Zebronics", "Zeb-Bold Pro", "Wireless", "Black", 699, 1600, 3, "office"],
    ["Redragon", "M711 Cobra", "Wired", "Black", 1499, 10000, 7, "gaming"],
    ["Redragon", "M908 Impact", "Wired", "Black", 2499, 12400, 19, "gaming"],
    ["Redragon", "M602 Griffin", "Wired", "Black", 1299, 7200, 7, "gaming"],
    ["Logitech", "Lift Vertical", "Wireless", "Graphite", 7995, 4000, 6, "ergonomic"],
    ["Razer", "Pro Click Mini", "Wireless", "White", 7999, 12000, 7, "office"]
  ];

  for (let i = 0; i < 30; i++) {
    const [brand, model, conn, color, price, dpi, buttons, useType] = mouseData[i];
    const originalPrice = Math.round(price * 1.18);
    const badge = useType === "gaming" ? "Gaming" : (conn === "Wireless" ? "Wireless" : "Wired");
    const connectionType = conn === "Wireless" ? "Bluetooth / 2.4GHz" : "USB-A";
    const name = `${brand} ${model} ${conn} Mouse (${color})`;
    products.push({
      slug: slugify(name + "-" + i),
      name, brand, category: "Mouse", price, originalPrice,
      rating: rating(i + 8), reviews: reviews(i + 17), stock: stock(i + 4),
      images: images3("mouse", i + 1), badge,
      description: `${brand} ${model} is a ${useType} mouse with ${dpi} DPI precision and ${buttons} buttons. ${conn} connectivity in ${color} finish for comfortable daily use.`,
      specs: [conn, `${dpi} DPI`, `${buttons} Buttons`, connectionType, useType.charAt(0).toUpperCase() + useType.slice(1)],
      featured: i < 4
    });
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
              : `<a class="account-link" href="/login">👤</a>`}
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
            <a href="/category/laptops">Laptops</a>
            <a href="/category/mobiles">Mobiles</a>
            <a href="/category/headphones">Headphones</a>
            <a href="/category/mouse">Mouse</a>
          </div>
          <div class="footer-col">
            <h4>Account</h4>
            ${user
              ? `<a href="/account">My Account</a>`
              : `<a href="/login">Sign In / Register</a>`}
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
  return Boolean(user && (user.email === "admin@electrohub.local" || user.name === "Admin123"));
}

if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
  try { require("./load-env"); } catch { /* optional */ }
}
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SYNTHETIC_EMAIL = process.env.ADMIN_SYNTHETIC_EMAIL || "admin@electrohub.local";
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.warn("[warn] ADMIN_USERNAME / ADMIN_PASSWORD not set. Admin login disabled. Copy .env.example to .env.");
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
  const products = productsV2;
  const recommended = products.slice(0, 4);
  const newArrivals = products.slice(4, 8);
  const featureItems = products.slice(8, 10);
  const popular = products.slice(10, 18);

  const formatPrice = (n) => "\u20B9" + Number(n).toLocaleString("en-IN");

  const productCardV2 = (p) => `
    <a class="v2-card" href="/products">
      <div class="v2-card-media"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy"></div>
      <div class="v2-card-body">
        <span class="v2-card-brand">${escapeHtml(p.brand)}</span>
        <h3 class="v2-card-name">${escapeHtml(p.name)}</h3>
        <div class="v2-card-price-row">
          <span class="v2-card-price">${formatPrice(p.price)}</span>
          ${p.originalPrice && p.originalPrice > p.price ? `<span class="v2-card-strike">${formatPrice(p.originalPrice)}</span>` : ""}
        </div>
        <span class="v2-card-btn">Add to cart</span>
      </div>
    </a>
  `;

  const slides = [
    {
      kicker: "New launch",
      title: "iPhone 12 Mini",
      subtitle: "Meet the Apple iPhone 12 Mini, Fotos contain lorem.",
      cta: "Shop now",
      image: "/public/assets/products-v2/prod-001.jpg",
      bg: "linear-gradient(135deg, #e9d8fd 0%, #f3e8ff 60%, #fce7f3 100%)"
    },
    {
      kicker: "Flagship",
      title: "Samsung Galaxy",
      subtitle: "Redefine your view with a 200MP camera and Dynamic AMOLED.",
      cta: "Explore",
      image: "/public/assets/products-v2/prod-002.jpg",
      bg: "linear-gradient(135deg, #fed7aa 0%, #fde68a 55%, #fecaca 100%)"
    },
    {
      kicker: "For creators",
      title: "MacBook Pro",
      subtitle: "Think differently. Built on the blazing-fast Apple M3 Pro chip.",
      cta: "Discover",
      image: "/public/assets/products-v2/prod-007.jpg",
      bg: "linear-gradient(135deg, #1f2937 0%, #111827 60%, #0f172a 100%)"
    }
  ];

  const slidesHTML = slides.map((s, i) => `
    <div class="v2-slide${i === 0 ? " is-active" : ""}" data-v2-slide="${i}" style="background:${s.bg};${i === 2 ? "color:#f9fafb;" : ""}">
      <div class="v2-slide-text">
        <span class="v2-slide-kicker">${escapeHtml(s.kicker)}</span>
        <h2 class="v2-slide-title">${escapeHtml(s.title)}</h2>
        <p class="v2-slide-sub">${escapeHtml(s.subtitle)}</p>
        <a class="v2-slide-cta" href="/products">${escapeHtml(s.cta)}</a>
      </div>
      <div class="v2-slide-media">
        <img src="${escapeHtml(s.image)}" alt="${escapeHtml(s.title)}">
      </div>
    </div>
  `).join("");

  const dotsHTML = slides.map((_, i) => `<button type="button" class="v2-dot${i === 0 ? " is-active" : ""}" data-v2-dot="${i}" aria-label="Go to slide ${i + 1}"></button>`).join("");

  const brands = ["Apple", "Samsung", "Canon", "Philips", "Tefal", "Sony", "LG", "Bose"];

  const offers = [
    { title: "Free shipping over \u20B9999", text: "Fast, trackable delivery on every qualifying order across India.", icon: "\uD83D\uDE9A", bg: "#dbeafe" },
    { title: "30-day easy returns", text: "Not the right fit? Send it back within 30 days, no questions asked.", icon: "\uD83D\uDD04", bg: "#fce7f3" },
    { title: "Secure checkout", text: "256-bit SSL and tokenised payments keep your data protected.", icon: "\uD83D\uDD12", bg: "#fef9c3" }
  ];

  return layout({
    title: "ElectroHub \u2014 Electronics reimagined",
    description: "Discover phones, laptops, audio, cameras and more curated for you.",
    currentPath: "/",
    user,
    content: `
      <main class="v2-home">
        <section class="v2-hero" data-v2-carousel>
          <div class="v2-hero-track">
            ${slidesHTML}
          </div>
          <button type="button" class="v2-hero-arrow prev" data-v2-prev aria-label="Previous slide">&lsaquo;</button>
          <button type="button" class="v2-hero-arrow next" data-v2-next aria-label="Next slide">&rsaquo;</button>
          <div class="v2-hero-dots">${dotsHTML}</div>
        </section>

        <section class="v2-brands">
          ${brands.map(b => `<span class="v2-brand">${escapeHtml(b)}</span>`).join("")}
        </section>

        <section class="v2-section v2-recommended">
          <div class="v2-section-head">
            <h2>Recommended for you</h2>
            <a class="v2-section-link" href="/products">View all</a>
          </div>
          <div class="v2-grid-row">
            ${recommended.map(productCardV2).join("")}
          </div>
        </section>

        <section class="v2-section v2-offers">
          <div class="v2-section-head"><h2>Our offers</h2></div>
          <div class="v2-offers-row">
            ${offers.map(o => `
              <article class="v2-offer-card" style="background:${o.bg}">
                <div class="v2-offer-icon" aria-hidden="true">${o.icon}</div>
                <h3>${escapeHtml(o.title)}</h3>
                <p>${escapeHtml(o.text)}</p>
              </article>
            `).join("")}
          </div>
        </section>

        <section class="v2-section v2-grid">
          <div class="v2-section-head">
            <h2>New arrivals</h2>
            <a class="v2-section-link" href="/products">View all</a>
          </div>
          <div class="v2-grid-row">
            ${newArrivals.map(productCardV2).join("")}
          </div>
        </section>

        <section class="v2-feature-banner">
          <div class="v2-feature-intro">
            <span class="v2-feature-kicker">Premium picks</span>
            <h2>Power meets design</h2>
            <p>Flagship performance from the brands you love, ready to ship today.</p>
            <a class="v2-feature-cta" href="/products">Browse premium</a>
          </div>
          <div class="v2-feature-row">
            ${featureItems.map(p => `
              <a class="v2-feature-card" href="/products">
                <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">
                <div class="v2-feature-body">
                  <span class="v2-feature-brand">${escapeHtml(p.brand)}</span>
                  <h3>${escapeHtml(p.name)}</h3>
                  <div class="v2-feature-price-row">
                    <span class="v2-feature-price">${formatPrice(p.price)}</span>
                    <span class="v2-feature-strike">${formatPrice(p.originalPrice)}</span>
                  </div>
                </div>
              </a>
            `).join("")}
          </div>
        </section>

        <section class="v2-section v2-popular">
          <div class="v2-section-head">
            <h2>Popular items</h2>
            <a class="v2-section-link" href="/products">View all</a>
          </div>
          <div class="v2-grid-row v2-grid-row-8">
            ${popular.map(productCardV2).join("")}
          </div>
        </section>

        <section class="v2-newsletter">
          <div class="v2-news-inner">
            <div class="v2-news-illus" aria-hidden="true">
              <svg viewBox="0 0 120 120" width="120" height="120" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="30" width="100" height="65" rx="8" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
                <path d="M10 35 L60 72 L110 35" fill="none" stroke="#f59e0b" stroke-width="2"/>
                <circle cx="95" cy="30" r="14" fill="#fbbf24"/>
                <path d="M88 30 L93 35 L102 26" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="v2-news-body">
              <h2>Subscribe to our newsletter</h2>
              <p>Get early access to launches, exclusive drops and subscriber-only discounts.</p>
              <form class="v2-news-form" action="/subscribe" method="POST">
                <input type="email" name="email" placeholder="you@example.com" required>
                <button type="submit">Subscribe</button>
              </form>
            </div>
          </div>
        </section>
      </main>
    `
  });
}

function renderCromaFooter() {
  return `
    <footer class="cr-footer">
      <div class="cr-footer-top">
        <div class="cr-footer-col cr-footer-brand">
          <span class="brand-word">electrohub</span>
          <p>India's favourite destination for electronics, gadgets & appliances.</p>
          <div class="cr-footer-social">
            <a href="#" aria-label="Facebook">f</a>
            <a href="#" aria-label="Instagram">IG</a>
            <a href="#" aria-label="Twitter">X</a>
            <a href="#" aria-label="YouTube">YT</a>
          </div>
        </div>
        <div class="cr-footer-col">
          <h4>Shop</h4>
          <a href="/category/laptops">Laptops</a>
          <a href="/category/mobiles">Mobiles</a>
          <a href="/category/headphones">Headphones</a>
          <a href="/category/mouse">Mouse</a>
          <a href="/products">All Products</a>
        </div>
        <div class="cr-footer-col">
          <h4>Customer Service</h4>
          <a href="/track">Track Order</a>
          <a href="#">Shipping & Delivery</a>
          <a href="#">Returns & Refunds</a>
          <a href="#">Cancellation Policy</a>
          <a href="#">Help & Support</a>
        </div>
        <div class="cr-footer-col">
          <h4>About ElectroHub</h4>
          <a href="#">Our Story</a>
          <a href="#">Store Locator</a>
          <a href="#">Careers</a>
          <a href="#">Press Room</a>
          <a href="#">Investor Relations</a>
        </div>
        <div class="cr-footer-col">
          <h4>Legal</h4>
          <a href="#">Terms of Use</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Disclaimer</a>
          <a href="#">Sitemap</a>
        </div>
      </div>
      <div class="cr-footer-apps">
        <div class="cr-footer-apps-text">
          <strong>Download the ElectroHub app</strong>
          <span>Exclusive offers, order tracking & wishlist on the go.</span>
        </div>
        <div class="cr-footer-apps-badges">
          <a href="#" class="cr-footer-badge">App Store</a>
          <a href="#" class="cr-footer-badge">Google Play</a>
        </div>
      </div>
      <div class="cr-footer-bottom">
        <span>© 2026 ElectroHub Services Ltd. All rights reserved.</span>
        <span>Made in India</span>
      </div>
    </footer>
  `;
}

const CR_HIDE_LEGACY_FOOTER_STYLE = `<style>body .site-footer{display:none!important;}</style>`;

function productsPage(url, forcedCategory = "", user = null) {
  const q = (url.searchParams.get("q") || "").trim();
  const category = forcedCategory || (url.searchParams.get("category") || "").trim();
  const sort = url.searchParams.get("sort") || "popular";
  const page = Math.max(Number(url.searchParams.get("page") || "1"), 1);
  const pageSize = 16;
  const readMulti = (key) => {
    const single = url.searchParams.get(key) || "";
    const fromSingle = single.split(",").map(s => s.trim()).filter(Boolean);
    const fromArray = url.searchParams.getAll(key + "[]").map(s => s.trim()).filter(Boolean);
    return Array.from(new Set([...fromSingle, ...fromArray]));
  };
  const brandsParam = readMulti("brand");
  const colorsParam = readMulti("color");
  const minPrice = Number(url.searchParams.get("minPrice") || "0") || 0;
  const maxPrice = Number(url.searchParams.get("maxPrice") || "0") || 0;
  const connection = (url.searchParams.get("connection") || "").trim().toLowerCase();
  const ramParam = readMulti("ram");
  const storageParam = readMulti("storage");

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
  if (brandsParam.length) {
    where.push(`brand IN (${brandsParam.map(() => "?").join(",")})`);
    params.push(...brandsParam);
  }
  if (colorsParam.length) {
    const colorCond = colorsParam.map(() => "name LIKE ?").join(" OR ");
    where.push(`(${colorCond})`);
    colorsParam.forEach(c => params.push(`%${c}%`));
  }
  if (minPrice > 0) { where.push("price >= ?"); params.push(minPrice); }
  if (maxPrice > 0) { where.push("price <= ?"); params.push(maxPrice); }
  if (connection === "wireless") {
    where.push("specs_json LIKE ?");
    params.push("%Wireless%");
  } else if (connection === "wired") {
    where.push("specs_json LIKE ? AND specs_json NOT LIKE ?");
    params.push("%Wired%", "%Wireless%");
  }
  if (ramParam.length) {
    const ramCond = ramParam.map(() => "specs_json LIKE ?").join(" OR ");
    where.push(`(${ramCond})`);
    ramParam.forEach(r => params.push(`%${r}%`));
  }
  if (storageParam.length) {
    const stCond = storageParam.map(() => "specs_json LIKE ?").join(" OR ");
    where.push(`(${stCond})`);
    storageParam.forEach(s => params.push(`%${s}%`));
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
  const total = allItems.length;
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const offset = (Math.min(page, pages) - 1) * pageSize;
  const items = allItems.slice(offset, offset + pageSize);
  const categories = getCategories();

  // Dynamic filter values
  const brandRows = category
    ? db.prepare("SELECT DISTINCT brand FROM products WHERE category = ? ORDER BY brand").all(category)
    : db.prepare("SELECT DISTINCT brand FROM products ORDER BY brand").all();
  const availableBrands = brandRows.map(r => r.brand);
  const availableColors = ["Black", "White", "Silver", "Gray", "Blue", "Red", "Gold", "Green", "Graphite", "Midnight", "Titanium"];
  const showElectronicsFilters = category === "Laptops" || category === "Mobiles";
  const showConnectionFilter = category === "Headphones" || category === "Mouse";

  return layout({
    title: category ? `${category} | ElectroHub` : "All Products | ElectroHub",
    description: "Browse the full electronics catalog with filters and sorting.",
    currentPath: "/products",
    user,
    content: `
      ${CR_HIDE_LEGACY_FOOTER_STYLE}
      <main class="cr-list-shell">
        <nav class="cr-list-breadcrumbs">
          <a href="/">Home</a>
          <span>/</span>
          <a href="/products">Products</a>
          ${category ? `<span>/</span><span class="cr-current">${escapeHtml(category)}</span>` : ""}
        </nav>

        <header class="cr-list-header">
          <div>
            <h1 class="cr-list-title">${category ? escapeHtml(category) : "All electronics"}</h1>
            <p class="cr-list-sub">${total} results${q ? ` for "${escapeHtml(q)}"` : ""}</p>
          </div>
          <div class="cr-list-toolbar">
            <form class="cr-list-sort" action="${category ? `/category/${slugify(category)}` : "/products"}" method="GET">
              ${q ? `<input type="hidden" name="q" value="${escapeHtml(q)}">` : ""}
              <label>Sort by
                <select name="sort" onchange="this.form.submit()">
                  <option value="popular" ${sort === "popular" ? "selected" : ""}>Popularity</option>
                  <option value="price-asc" ${sort === "price-asc" ? "selected" : ""}>Price: Low to High</option>
                  <option value="price-desc" ${sort === "price-desc" ? "selected" : ""}>Price: High to Low</option>
                  <option value="rating" ${sort === "rating" ? "selected" : ""}>Customer Rating</option>
                </select>
              </label>
            </form>
          </div>
        </header>

        <div class="cr-list-layout">
          <aside class="cr-list-sidebar" data-cr-sidebar>
            <button class="cr-list-sidebar-toggle" type="button" data-cr-sidebar-toggle>Filters</button>
            <form class="cr-list-filter-form eo-filter-form" action="${category ? `/category/${slugify(category)}` : "/products"}" method="GET" data-eo-filter-form>
              <div class="cr-filter-block">
                <h4>Search</h4>
                <input type="search" name="q" value="${escapeHtml(q)}" placeholder="Search products">
              </div>
              ${forcedCategory ? "" : `
                <div class="cr-filter-block">
                  <h4>Category</h4>
                  <div class="cr-filter-list">
                    ${categories.map((item) => `
                      <label class="cr-filter-check">
                        <input type="radio" name="category" value="${escapeHtml(item.category)}" ${item.category === category ? "checked" : ""}>
                        <span>${escapeHtml(item.category)} (${item.count})</span>
                      </label>
                    `).join("")}
                  </div>
                </div>
              `}
              <div class="cr-filter-block">
                <h4>Brand</h4>
                <div class="cr-filter-list" data-eo-multi="brand">
                  ${availableBrands.map((b) => `
                    <label class="cr-filter-check"><input type="checkbox" name="brand[]" value="${escapeHtml(b)}" ${brandsParam.includes(b) ? "checked" : ""}><span>${escapeHtml(b)}</span></label>
                  `).join("")}
                </div>
              </div>
              <div class="cr-filter-block">
                <h4>Price Range (₹)</h4>
                <div class="eo-price-range">
                  <input type="number" name="minPrice" placeholder="Min" value="${minPrice || ""}" min="0">
                  <input type="number" name="maxPrice" placeholder="Max" value="${maxPrice || ""}" min="0">
                </div>
              </div>
              <div class="cr-filter-block">
                <h4>Colour</h4>
                <div class="cr-filter-list" data-eo-multi="color">
                  ${availableColors.map((c) => `
                    <label class="cr-filter-check"><input type="checkbox" name="color[]" value="${escapeHtml(c)}" ${colorsParam.includes(c) ? "checked" : ""}><span>${escapeHtml(c)}</span></label>
                  `).join("")}
                </div>
              </div>
              ${showConnectionFilter ? `
                <div class="cr-filter-block">
                  <h4>Connection</h4>
                  <div class="cr-filter-list">
                    <label class="cr-filter-check"><input type="radio" name="connection" value="" ${!connection ? "checked" : ""}><span>All</span></label>
                    <label class="cr-filter-check"><input type="radio" name="connection" value="wireless" ${connection === "wireless" ? "checked" : ""}><span>Wireless</span></label>
                    <label class="cr-filter-check"><input type="radio" name="connection" value="wired" ${connection === "wired" ? "checked" : ""}><span>Wired</span></label>
                  </div>
                </div>
              ` : ""}
              ${showElectronicsFilters ? `
                <div class="cr-filter-block">
                  <h4>RAM</h4>
                  <div class="cr-filter-list" data-eo-multi="ram">
                    ${["6GB RAM","8GB RAM","12GB RAM","16GB RAM","32GB RAM"].map(r => `
                      <label class="cr-filter-check"><input type="checkbox" name="ram[]" value="${r}" ${ramParam.includes(r) ? "checked" : ""}><span>${r}</span></label>
                    `).join("")}
                  </div>
                </div>
                <div class="cr-filter-block">
                  <h4>Storage</h4>
                  <div class="cr-filter-list" data-eo-multi="storage">
                    ${["128GB","256GB","512GB","1TB"].map(s => `
                      <label class="cr-filter-check"><input type="checkbox" name="storage[]" value="${s}" ${storageParam.includes(s) ? "checked" : ""}><span>${s}</span></label>
                    `).join("")}
                  </div>
                </div>
              ` : ""}
              <input type="hidden" name="sort" value="${escapeHtml(sort)}">
              <button class="cr-filter-apply" type="submit">Apply Filters</button>
              <a class="cr-filter-apply" style="display:block;text-align:center;margin-top:8px;background:transparent;color:var(--muted);border:1px solid var(--border)" href="${category ? `/category/${slugify(category)}` : "/products"}">Clear All</a>
            </form>
          </aside>

          <section class="cr-list-results">
            <div class="cr-list-chips">
              ${q ? `<span class="cr-chip">"${escapeHtml(q)}" ×</span>` : ""}
              ${category ? `<span class="cr-chip">${escapeHtml(category)} ×</span>` : ""}
              <span class="cr-chip cr-chip-muted">Free Delivery</span>
              <span class="cr-chip cr-chip-muted">In Stock</span>
            </div>
            <div class="cr-list-grid">
              ${items.map(productCard).join("")}
            </div>
            <nav class="cr-list-pagination">
              ${Array.from({ length: pages }, (_, index) => {
                const number = index + 1;
                const pageUrl = new URL(url.pathname, "http://localhost");
                if (q) pageUrl.searchParams.set("q", q);
                if (!forcedCategory && category) pageUrl.searchParams.set("category", category);
                if (sort) pageUrl.searchParams.set("sort", sort);
                pageUrl.searchParams.set("page", number);
                return `<a class="${number === Math.min(page, pages) ? "is-active" : ""}" href="${pageUrl.pathname}${pageUrl.search}">${number}</a>`;
              }).join("")}
            </nav>
          </section>
        </div>
      </main>
      ${renderCromaFooter()}
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
      ${CR_HIDE_LEGACY_FOOTER_STYLE}
      <main class="cr-pdp-shell">
        <nav class="cr-pdp-breadcrumbs">
          <a href="/">Home</a><span>/</span>
          <a href="/products">${escapeHtml(product.category)}</a><span>/</span>
          <a href="/category/${slugify(product.category)}">${escapeHtml(product.brand)}</a><span>/</span>
          <span class="cr-current">${escapeHtml(product.name)}</span>
        </nav>

        <div class="cr-pdp-top">
          <div class="cr-pdp-gallery">
            <div class="cr-pdp-thumbs">
              ${galleryItems.map((image, index) => `
                <button class="cr-pdp-thumb ${index === 0 ? "is-active" : ""}" type="button" data-cr-thumb data-src="${escapeHtml(image)}">
                  <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)} ${index + 1}">
                </button>
              `).join("")}
            </div>
            <div class="cr-pdp-stage">
              <img data-cr-stage src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
            </div>
          </div>

          <aside class="cr-pdp-info">
            <p class="cr-pdp-eyebrow">${escapeHtml(product.brand)}</p>
            <h1 class="cr-pdp-title">${escapeHtml(product.name)}</h1>
            <div class="cr-pdp-rating">
              <span class="cr-pdp-stars">★ ${product.rating}</span>
              <span class="cr-pdp-reviews">(${product.reviews.toLocaleString("en-IN")} reviews)</span>
            </div>
            <div class="cr-pdp-price-row">
              <strong class="cr-pdp-price">${currency(product.price)}</strong>
              ${product.original_price > product.price ? `<span class="cr-pdp-strike">${currency(product.original_price)}</span>` : ""}
              ${product.original_price > product.price ? `<span class="cr-pdp-off">${Math.round(((product.original_price - product.price)/product.original_price)*100)}% off</span>` : ""}
            </div>
            <p class="cr-pdp-tax">Inclusive of all taxes · EMI from ${currency(Math.round(product.price/24))}/mo</p>

            ${colorVariants.length ? `
              <div class="cr-pdp-variant">
                <span class="cr-pdp-variant-label">Colour</span>
                <div class="cr-pdp-variant-row">
                  ${colorVariants.map((item) => `<a class="cr-pdp-variant-pill ${item.slug === product.slug ? "is-active" : ""}" href="/product/${item.slug}">${escapeHtml(item.color)}</a>`).join("")}
                </div>
              </div>
            ` : ""}

            ${memoryVariants.length ? `
              <div class="cr-pdp-variant">
                <span class="cr-pdp-variant-label">Storage</span>
                <div class="cr-pdp-variant-row">
                  ${memoryVariants.map((item) => `<a class="cr-pdp-variant-pill ${item.slug === product.slug ? "is-active" : ""}" href="/product/${item.slug}">${escapeHtml(item.memory)}</a>`).join("")}
                </div>
              </div>
            ` : ""}

            <div class="cr-pdp-pincode">
              <span>Deliver to</span>
              <input type="text" placeholder="Enter pincode" maxlength="6" value="400049">
              <button type="button">Check</button>
            </div>
            <p class="cr-pdp-delivery">Delivery by 16 April · Free shipping above ₹499</p>

            <div class="cr-pdp-ctas">
              <a class="cr-pdp-buy" href="/checkout">Buy Now</a>
              <button class="cr-pdp-cart" data-add-to-cart='${JSON.stringify({
                id: product.id,
                slug: product.slug,
                name: product.name,
                price: product.price,
                image: product.image
              }).replace(/'/g, "&apos;")}'>Add to Cart</button>
            </div>

            <ul class="cr-pdp-perks">
              <li>Free 7-day returns</li>
              <li>1 year brand warranty</li>
              <li>Secure payments</li>
            </ul>
          </aside>
        </div>

        <section class="cr-pdp-offers">
          <h3>Bank Offers & EMI</h3>
          <div class="cr-pdp-offers-grid">
            <article><strong>HDFC Bank</strong><span>10% instant discount on credit cards</span></article>
            <article><strong>No-Cost EMI</strong><span>Up to 12 months on select cards</span></article>
            <article><strong>Exchange</strong><span>Extra ₹2,000 off on exchange</span></article>
          </div>
        </section>

        <section class="cr-pdp-specs">
          <h3>Specifications</h3>
          <table class="cr-pdp-specs-table">
            <tbody>
              <tr><th>Brand</th><td>${escapeHtml(product.brand)}</td></tr>
              <tr><th>Category</th><td>${escapeHtml(product.category)}</td></tr>
              <tr><th>Colour</th><td>${escapeHtml(product.color || "Standard")}</td></tr>
              <tr><th>Storage</th><td>${escapeHtml(product.memory || "—")}</td></tr>
              <tr><th>Stock</th><td>${product.stock} units</td></tr>
              ${specs.slice(0,6).map((spec,i) => `<tr><th>Feature ${i+1}</th><td>${escapeHtml(spec)}</td></tr>`).join("")}
            </tbody>
          </table>
        </section>

        <section class="cr-pdp-description">
          <h3>Product Description</h3>
          <p>${escapeHtml(product.description)}</p>
        </section>

        <section class="cr-pdp-similar">
          <h3>Similar Products</h3>
          <div class="cr-pdp-similar-rail">
            ${related.map(productCard).join("")}
          </div>
        </section>
      </main>
      ${renderCromaFooter()}
    `
  });
}

function cartPage(user = null) {
  return layout({
    title: "Your Cart | ElectroHub",
    currentPath: "/cart",
    user,
    content: `
      ${CR_HIDE_LEGACY_FOOTER_STYLE}
      <main class="cr-cart-shell">
        <header class="cr-cart-header">
          <h1>Your Cart</h1>
          <p class="cr-cart-sub">Review items before checkout</p>
        </header>

        <div class="cr-cart-layout">
          <section class="cr-cart-items">
            <div class="cr-cart-items-head">
              <span>Product</span>
              <span>Quantity</span>
              <span>Price</span>
            </div>
            <div class="cr-cart-items-body" data-cart-items></div>
            <a class="cr-cart-continue" href="/products">← Continue shopping</a>
          </section>

          <aside class="cr-cart-summary">
            <h3>Order Summary</h3>
            <div class="cr-cart-row"><span>Subtotal (<em data-cart-items-count>0</em> items)</span><strong data-cart-total>${currency(0)}</strong></div>
            <div class="cr-cart-row"><span>Delivery</span><strong class="cr-cart-free">FREE</strong></div>
            <div class="cr-cart-row"><span>Estimated Tax</span><strong>Calculated at checkout</strong></div>
            <div class="cr-cart-promo">
              <input type="text" placeholder="Enter promo code">
              <button type="button">Apply</button>
            </div>
            <div class="cr-cart-row cr-cart-total"><span>Total</span><strong data-cart-total>${currency(0)}</strong></div>
            <a class="cr-cart-checkout" href="/checkout">Proceed to Checkout</a>
            <p class="cr-cart-secure">Secure checkout · 7-day returns</p>
          </aside>
        </div>
      </main>
      ${renderCromaFooter()}
    `
  });
}

function checkoutPage(user = null) {
  return layout({
    title: "Checkout | ElectroHub",
    currentPath: "/cart",
    user,
    content: `
      ${CR_HIDE_LEGACY_FOOTER_STYLE}
      <main class="cr-co-shell">
        <header class="cr-co-header">
          <h1>Checkout</h1>
        </header>

        <ol class="cr-co-stepper" data-cr-steps>
          <li class="is-active" data-step="1"><span>1</span>Shipping</li>
          <li data-step="2"><span>2</span>Payment</li>
          <li data-step="3"><span>3</span>Review</li>
        </ol>

        <details class="cr-co-summary-collapse">
          <summary>Order Summary <span class="cr-co-summary-total" data-checkout-total>${currency(0)}</span></summary>
          <div class="cr-co-summary-body" data-checkout-items></div>
        </details>

        <form class="cr-co-form" data-checkout-form data-cr-form>
          <section class="cr-co-step is-active" data-step-body="1">
            <h2>Shipping Details</h2>
            <label>Full name<input name="customerName" value="${escapeHtml(user?.name || "")}" required></label>
            <label>Email<input type="email" name="email" value="${escapeHtml(user?.email || "")}" required></label>
            <label>Phone<input name="phone" required></label>
            <label>Address<input name="address" required></label>
            <div class="cr-co-grid-2">
              <label>City<input name="city" required></label>
              <label>State<input name="state" required></label>
            </div>
            <label>Pincode<input name="pincode" required></label>
            <div class="cr-co-actions">
              <button type="button" class="cr-co-next" data-cr-next>Continue to Payment</button>
            </div>
          </section>

          <section class="cr-co-step" data-step-body="2">
            <h2>Payment Method</h2>
            <label class="cr-co-pay-option"><input type="radio" name="pay" value="card" checked><span>Credit / Debit Card</span></label>
            <label class="cr-co-pay-option"><input type="radio" name="pay" value="upi"><span>UPI</span></label>
            <label class="cr-co-pay-option"><input type="radio" name="pay" value="cod"><span>Cash on Delivery</span></label>
            <div class="cr-co-actions">
              <button type="button" class="cr-co-back" data-cr-back>Back</button>
              <button type="button" class="cr-co-next" data-cr-next>Continue to Review</button>
            </div>
          </section>

          <section class="cr-co-step" data-step-body="3">
            <h2>Review & Place Order</h2>
            <p class="cr-co-review-note">Confirm your details and place the order.</p>
            <div class="cr-co-actions">
              <button type="button" class="cr-co-back" data-cr-back>Back</button>
              <button class="cr-co-place" type="submit">Place Order</button>
            </div>
            <p class="cr-co-message subtle" data-checkout-message></p>
          </section>
        </form>
      </main>
      ${renderCromaFooter()}
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

function authPage({ message = "", email = "", verified = false, error = "" } = {}, user = null) {
  return layout({
    title: "Login | ElectroHub",
    currentPath: "/login",
    user,
    content: `
      ${CR_HIDE_LEGACY_FOOTER_STYLE}
      <main class="eo-auth-shell">
        <section class="eo-auth-split">
          <aside class="eo-auth-left">
            <div class="eo-auth-left-inner">
              <h2 class="eo-auth-tag">Welcome back</h2>
              <p class="eo-auth-tag-sub">Sign in to continue exploring curated electronics across laptops, mobiles, headphones, and mouse gear.</p>
              <div class="eo-auth-illus" aria-hidden="true">
                <span></span><span></span><span></span>
              </div>
              <p class="eo-auth-quote">"Shopping is joy when it's this easy."</p>
            </div>
          </aside>
          <div class="eo-auth-right">
            <div class="eo-auth-card">
              <h1 class="eo-auth-title">Login</h1>
              <p class="eo-auth-sub">Enter your email and password to access your account.</p>
              ${verified ? `<div class="eo-auth-banner eo-auth-success">Signup successful — you can login now.</div>` : ""}
              ${message ? `<div class="eo-auth-banner">${escapeHtml(message)}</div>` : ""}
              ${error ? `<div class="eo-auth-banner eo-auth-error">${error}</div>` : ""}
              <form class="eo-auth-form" method="POST" action="/auth/login">
                <label>Email<input type="email" name="email" value="${escapeHtml(email)}" required autocomplete="email"></label>
                <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
                <button class="eo-auth-btn" type="submit">Login</button>
              </form>
              <p class="eo-auth-foot">New here? <a href="/signup">Create an account</a></p>
              <p class="eo-auth-foot-sm">Are you an administrator? <a href="/admin/login">Admin login</a></p>
            </div>
          </div>
        </section>
      </main>
      ${renderCromaFooter()}
    `
  });
}

function signupPage({ message = "", error = "", name = "", email = "" } = {}, user = null) {
  return layout({
    title: "Sign up | ElectroHub",
    currentPath: "/signup",
    user,
    content: `
      ${CR_HIDE_LEGACY_FOOTER_STYLE}
      <main class="eo-auth-shell">
        <section class="eo-auth-split">
          <aside class="eo-auth-left eo-auth-left-alt">
            <div class="eo-auth-left-inner">
              <h2 class="eo-auth-tag">Join ElectroHub</h2>
              <p class="eo-auth-tag-sub">Create your free account in under a minute. Verify via email OTP and start shopping instantly.</p>
              <div class="eo-auth-illus" aria-hidden="true">
                <span></span><span></span><span></span>
              </div>
            </div>
          </aside>
          <div class="eo-auth-right">
            <div class="eo-auth-card">
              <h1 class="eo-auth-title">Create account</h1>
              <p class="eo-auth-sub">Three quick fields to get started.</p>
              ${message ? `<div class="eo-auth-banner">${escapeHtml(message)}</div>` : ""}
              ${error ? `<div class="eo-auth-banner eo-auth-error">${error}</div>` : ""}
              <form class="eo-auth-form" method="POST" action="/auth/signup">
                <label>Full name<input name="name" value="${escapeHtml(name)}" required></label>
                <label>Email<input type="email" name="email" value="${escapeHtml(email)}" required autocomplete="email"></label>
                <label>Password<input type="password" name="password" required autocomplete="new-password" minlength="6"></label>
                <button class="eo-auth-btn" type="submit">Sign up</button>
              </form>
              <p class="eo-auth-foot">Already have an account? <a href="/login">Login</a></p>
            </div>
          </div>
        </section>
      </main>
      ${renderCromaFooter()}
    `
  });
}

function signupSuccessPage(email, user = null) {
  return layout({
    title: "Check your email | ElectroHub",
    currentPath: "/signup",
    user,
    content: `
      ${CR_HIDE_LEGACY_FOOTER_STYLE}
      <main class="eo-auth-shell">
        <section class="eo-auth-split">
          <div class="eo-auth-right" style="grid-column:1 / -1">
            <div class="eo-auth-card">
              <h1 class="eo-auth-title">Check your email</h1>
              <p class="eo-auth-sub">We've sent a verification link and OTP to <strong>${escapeHtml(email)}</strong>. Click the link in the email to verify your account, then return to login.</p>
              <a class="eo-auth-btn" href="/login" style="display:inline-block;text-align:center;text-decoration:none">Back to login</a>
            </div>
          </div>
        </section>
      </main>
      ${renderCromaFooter()}
    `
  });
}

function adminLoginPage({ error = "" } = {}) {
  return layout({
    title: "Admin Login | ElectroHub",
    currentPath: "/admin/login",
    user: null,
    content: `
      ${CR_HIDE_LEGACY_FOOTER_STYLE}
      <main class="eo-admin-auth-shell">
        <div class="eo-admin-auth-card">
          <div class="eo-admin-auth-badge">ADMIN PORTAL</div>
          <h1 class="eo-admin-auth-title">Sign in to Admin</h1>
          <p class="eo-admin-auth-sub">Restricted access. Authorised personnel only.</p>
          ${error ? `<div class="eo-auth-banner eo-auth-error">${escapeHtml(error)}</div>` : ""}
          <form class="eo-auth-form eo-admin-auth-form" method="POST" action="/admin/login">
            <label>Username<input name="username" required autocomplete="username"></label>
            <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
            <button class="eo-auth-btn eo-admin-auth-btn" type="submit">Sign in</button>
          </form>
          <p class="eo-auth-foot-sm"><a href="/login">← Back to user login</a></p>
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

const ORDER_STATUS_OPTIONS = [
  "Pending Pickup",
  "Collection Scan",
  "Out for Delivery",
  "Delivery Attempt Failed",
  "Customer Recall",
  "Delivered",
  "Cancelled"
];

function adminPage(user = null, opts = {}) {
  const section = opts.section || "dashboard";
  const q = (opts.q || "").trim();
  const stats = {
    products: db.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    categories: db.prepare("SELECT COUNT(DISTINCT category) AS count FROM products").get().count,
    orders: db.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    revenue: db.prepare("SELECT COALESCE(SUM(total), 0) AS total FROM orders").get().total,
    customers: db.prepare("SELECT COUNT(DISTINCT email) AS count FROM orders").get().count
  };
  const userCount = (() => {
    try { return db.prepare("SELECT COUNT(*) AS count FROM users").get().count; } catch { return 0; }
  })();
  const latestOrders = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 10").all();
  const editSlug = user && user.__editSlug ? user.__editSlug : "";
  const editProduct = editSlug ? normalizeProduct(db.prepare("SELECT * FROM products WHERE slug = ?").get(editSlug)) : null;
  const allProducts = db.prepare("SELECT * FROM products ORDER BY id DESC").all().map(normalizeProduct);
  const allOrders = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
  const allCustomers = db.prepare("SELECT DISTINCT email, customer_name FROM orders ORDER BY customer_name").all();
  let allUsers = [];
  try {
    allUsers = db.prepare("SELECT id, name, email, password_hash, verified FROM users ORDER BY id DESC").all();
  } catch { allUsers = []; }

  let searchResults = null;
  if (q) {
    const like = `%${q}%`;
    searchResults = {
      orders: db.prepare("SELECT * FROM orders WHERE order_code LIKE ? OR customer_name LIKE ? OR total LIKE ? ORDER BY id DESC LIMIT 25").all(like, like, like),
      products: db.prepare("SELECT * FROM products WHERE name LIKE ? OR brand LIKE ? OR price LIKE ? ORDER BY id DESC LIMIT 25").all(like, like, like).map(normalizeProduct)
    };
  }

  const statusOptions = (current) => ORDER_STATUS_OPTIONS.map(s =>
    `<option value="${escapeHtml(s)}" ${s === current ? "selected" : ""}>${escapeHtml(s)}</option>`
  ).join("");

  const productsSection = `
    <section class="cr-admin-card" id="products">
      <div class="cr-admin-card-head">
        <h3>All Products (${stats.products})</h3>
        <a class="cr-admin-primary" href="#add-product">+ Add new product</a>
      </div>
      <form method="POST" action="/admin/products/bulk-delete" onsubmit="return confirm('Delete selected products?')">
        <div style="max-height:520px;overflow:auto">
        <table class="cr-admin-table eo-admin-products-table">
          <thead><tr><th><input type="checkbox" data-eo-check-all></th><th>Image</th><th>Name</th><th>Brand</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead>
          <tbody>
            ${allProducts.map((product) => `
              <tr>
                <td><input type="checkbox" name="slugs[]" value="${escapeHtml(product.slug)}" class="eo-row-check"></td>
                <td><img src="${escapeHtml(product.image)}" alt="" class="eo-admin-thumb"></td>
                <td>${escapeHtml(product.name)}</td>
                <td>${escapeHtml(product.brand)}</td>
                <td>${currency(product.price)}</td>
                <td>${product.stock}</td>
                <td class="cr-admin-actions-cell">
                  <a class="cr-admin-ghost" href="/admin?section=products&edit=${encodeURIComponent(product.slug)}">Edit</a>
                  <form method="POST" action="/admin/products/delete" style="display:inline" onsubmit="return confirm('Delete ${escapeHtml(product.name).replace(/'/g, "")}?')">
                    <input type="hidden" name="slug" value="${escapeHtml(product.slug)}">
                    <button class="cr-admin-danger" type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        </div>
        <div class="cr-admin-form-actions">
          <button class="cr-admin-danger" type="submit">Delete selected</button>
        </div>
      </form>
    </section>

    <section class="cr-admin-card" id="add-product">
      <div class="cr-admin-card-head"><h3>${editProduct ? "Edit Product" : "Add new product"}</h3></div>
      <form class="cr-admin-form" method="POST" action="/admin/products">
        <input type="hidden" name="existingSlug" value="${escapeHtml(editProduct?.slug || "")}">
        <label>Product name<input name="name" value="${escapeHtml(editProduct?.name || "")}" required></label>
        <div class="cr-admin-grid-2">
          <label>Brand<input name="brand" value="${escapeHtml(editProduct?.brand || "")}" required></label>
          <label>Category
            <select name="category" required>
              ${["Laptops","Mobiles","Headphones","Mouse"].map(c => `<option value="${c}" ${editProduct?.category === c ? "selected" : ""}>${c}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="cr-admin-grid-2">
          <label>Price<input name="price" type="number" value="${escapeHtml(editProduct?.price || "")}" required></label>
          <label>Original price<input name="originalPrice" type="number" value="${escapeHtml(editProduct?.original_price || "")}" required></label>
        </div>
        <div class="cr-admin-grid-2">
          <label>Rating<input name="rating" type="number" step="0.1" value="${escapeHtml(editProduct?.rating || "4.2")}" required></label>
          <label>Reviews<input name="reviews" type="number" value="${escapeHtml(editProduct?.reviews || "100")}" required></label>
        </div>
        <div class="cr-admin-grid-2">
          <label>Stock<input name="stock" type="number" value="${escapeHtml(editProduct?.stock || "10")}" required></label>
          <label>Badge<input name="badge" value="${escapeHtml(editProduct?.badge || "New")}" required></label>
        </div>
        <label>Description<input name="description" value="${escapeHtml(editProduct?.description || "")}" required></label>
        <label>Images (one per line)<textarea name="images" rows="3">${escapeHtml((editProduct?.images || []).join("\n"))}</textarea></label>
        <label>Specs (one per line)<textarea name="specs" rows="3">${escapeHtml((editProduct?.specs || []).join("\n"))}</textarea></label>
        <div class="cr-admin-form-actions">
          <button class="cr-admin-primary" type="submit">${editProduct ? "Update product" : "Add product"}</button>
          ${editProduct ? `<a class="cr-admin-ghost" href="/admin?section=products">Cancel</a>` : ""}
        </div>
      </form>
    </section>
  `;

  const ordersSection = `
    <section class="cr-admin-card" id="orders">
      <div class="cr-admin-card-head"><h3>All Orders (${stats.orders})</h3></div>
      <div style="overflow-x:auto">
      <table class="cr-admin-table eo-admin-orders-table">
        <thead><tr><th>Ref</th><th>Customer</th><th>Date</th><th>Shipping Address</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          ${allOrders.length ? allOrders.map(order => `
            <tr>
              <td>${escapeHtml(order.order_code)}</td>
              <td>${escapeHtml(order.customer_name)}</td>
              <td>${new Date(order.created_at).toLocaleDateString("en-IN")}</td>
              <td>${escapeHtml(order.address)}, ${escapeHtml(order.city)}, ${escapeHtml(order.state)} ${escapeHtml(order.pincode)}</td>
              <td>${currency(order.total)}</td>
              <td>
                <form method="POST" action="/admin/orders/status" class="eo-status-form" data-eo-status-form>
                  <input type="hidden" name="orderCode" value="${escapeHtml(order.order_code)}">
                  <select name="status" data-eo-status-select>
                    ${statusOptions(order.status)}
                  </select>
                  <noscript><button type="submit">Update</button></noscript>
                </form>
              </td>
            </tr>
          `).join("") : `<tr><td colspan="6">No orders yet.</td></tr>`}
        </tbody>
      </table>
      </div>
    </section>
  `;

  const customersSection = `
    <section class="cr-admin-card" id="customers">
      <div class="cr-admin-card-head"><h3>Customers (${stats.customers})</h3></div>
      <table class="cr-admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Orders</th></tr></thead>
        <tbody>
          ${allCustomers.length ? allCustomers.map(c => {
            const count = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE email = ?").get(c.email).c;
            return `<tr><td>${escapeHtml(c.customer_name)}</td><td>${escapeHtml(c.email)}</td><td>${count}</td></tr>`;
          }).join("") : `<tr><td colspan="3">No customers yet.</td></tr>`}
        </tbody>
      </table>
    </section>
  `;

  const maskedPwd = (hash) => {
    const s = String(hash || "");
    return s ? s.slice(0, 6) + "••••••••" : "(n/a)";
  };
  const settingsSection = `
    <section class="cr-admin-card" id="settings">
      <div class="cr-admin-card-head"><h3>Settings</h3></div>
      <form method="POST" action="/admin/logout">
        <button class="cr-admin-danger" type="submit">Logout</button>
      </form>
    </section>
    <section class="cr-admin-card">
      <div class="cr-admin-card-head"><h3>User Management (${userCount})</h3></div>
      <div style="overflow-x:auto">
      <table class="cr-admin-table">
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Password (masked)</th><th>Verified</th><th>Orders</th></tr></thead>
        <tbody>
          ${allUsers.length ? allUsers.map(u => {
            const orders = db.prepare("SELECT order_code FROM orders WHERE email = ? ORDER BY id DESC").all(u.email);
            const refs = orders.map(o => o.order_code).join(", ") || "—";
            return `<tr>
              <td>${u.id}</td>
              <td>${escapeHtml(u.name)}</td>
              <td>${escapeHtml(u.email)}</td>
              <td><code>${escapeHtml(maskedPwd(u.password_hash))}</code></td>
              <td>${u.verified ? "Yes" : "No"}</td>
              <td>${escapeHtml(refs)}</td>
            </tr>`;
          }).join("") : `<tr><td colspan="6">No users registered yet.</td></tr>`}
        </tbody>
      </table>
      </div>
    </section>
  `;

  const dashboardSection = `
    <section class="cr-admin-kpis" id="dashboard">
      <article class="cr-admin-kpi">
        <span class="cr-admin-kpi-label">Total Revenue</span>
        <strong>${currency(stats.revenue)}</strong>
      </article>
      <article class="cr-admin-kpi">
        <span class="cr-admin-kpi-label">Orders</span>
        <strong>${stats.orders}</strong>
      </article>
      <article class="cr-admin-kpi">
        <span class="cr-admin-kpi-label">Customers</span>
        <strong>${stats.customers}</strong>
      </article>
      <article class="cr-admin-kpi">
        <span class="cr-admin-kpi-label">Products</span>
        <strong>${stats.products}</strong>
        <span class="cr-admin-kpi-trend">${stats.categories} categories</span>
      </article>
    </section>

    <section class="cr-admin-card">
      <div class="cr-admin-card-head"><h3>Recent Orders</h3><a href="/admin?section=orders">View all</a></div>
      <table class="cr-admin-table">
        <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          ${latestOrders.length ? latestOrders.map((order) => `
            <tr>
              <td>${escapeHtml(order.order_code)}</td>
              <td>${escapeHtml(order.customer_name)}</td>
              <td>${currency(order.total)}</td>
              <td><span class="cr-admin-status">${escapeHtml(order.status)}</span></td>
            </tr>
          `).join("") : `<tr><td colspan="4">No orders yet.</td></tr>`}
        </tbody>
      </table>
    </section>
  `;

  let mainBody = "";
  if (searchResults) {
    mainBody = `
      <section class="cr-admin-card">
        <div class="cr-admin-card-head"><h3>Search results for "${escapeHtml(q)}"</h3></div>
        <h4 style="margin:12px 0 6px">Orders (${searchResults.orders.length})</h4>
        <table class="cr-admin-table">
          <thead><tr><th>Ref</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>${searchResults.orders.map(o => `<tr><td>${escapeHtml(o.order_code)}</td><td>${escapeHtml(o.customer_name)}</td><td>${currency(o.total)}</td><td>${escapeHtml(o.status)}</td></tr>`).join("") || `<tr><td colspan="4">No matching orders.</td></tr>`}</tbody>
        </table>
        <h4 style="margin:18px 0 6px">Products (${searchResults.products.length})</h4>
        <table class="cr-admin-table">
          <thead><tr><th>Name</th><th>Brand</th><th>Price</th><th>Stock</th></tr></thead>
          <tbody>${searchResults.products.map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.brand)}</td><td>${currency(p.price)}</td><td>${p.stock}</td></tr>`).join("") || `<tr><td colspan="4">No matching products.</td></tr>`}</tbody>
        </table>
      </section>
    `;
  } else if (section === "products") {
    mainBody = productsSection;
  } else if (section === "orders") {
    mainBody = ordersSection;
  } else if (section === "customers") {
    mainBody = customersSection;
  } else if (section === "settings") {
    mainBody = settingsSection;
  } else {
    mainBody = dashboardSection;
  }

  const navItem = (href, label, id) =>
    `<a class="${section === id && !searchResults ? "is-active" : ""}" href="${href}">${label}</a>`;

  return layout({
    title: "Admin | ElectroHub",
    currentPath: "/admin",
    user,
    content: `
      ${CR_HIDE_LEGACY_FOOTER_STYLE}
      <main class="cr-admin-shell">
        <aside class="cr-admin-sidebar" data-cr-admin-sidebar>
          <div class="cr-admin-logo">ElectroHub <span>Admin</span></div>
          <nav class="cr-admin-nav">
            ${navItem("/admin?section=dashboard", "Dashboard", "dashboard")}
            ${navItem("/admin?section=products", "Products", "products")}
            ${navItem("/admin?section=orders", "Orders", "orders")}
            ${navItem("/admin?section=customers", "Customers", "customers")}
            ${navItem("/admin?section=settings", "Settings", "settings")}
          </nav>
        </aside>

        <div class="cr-admin-main">
          <header class="cr-admin-topbar">
            <button class="cr-admin-menu" type="button" data-cr-admin-menu>☰</button>
            <form action="/admin" method="GET" class="eo-admin-search-form">
              <input class="cr-admin-search" type="search" name="q" value="${escapeHtml(q)}" placeholder="Search by order ref, customer, product, amount...">
            </form>
            <div class="cr-admin-profile">
              <span class="cr-admin-avatar">${escapeHtml((user?.name || "A").charAt(0).toUpperCase())}</span>
              <span class="cr-admin-name">${escapeHtml(user?.name || "Admin")}</span>
            </div>
          </header>

          ${mainBody}
        </div>
      </main>
      ${renderCromaFooter()}
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
      res.writeHead(302, { Location: "/admin/login" });
      res.end();
      return;
    }
    const adminUser = { ...currentUser, __editSlug: url.searchParams.get("edit") || "" };
    html(res, 200, adminPage(adminUser, {
      section: url.searchParams.get("section") || "dashboard",
      q: url.searchParams.get("q") || ""
    }));
    return;
  }

  if (req.method === "GET" && pathname === "/admin/login") {
    html(res, 200, adminLoginPage({ error: url.searchParams.get("error") || "" }));
    return;
  }

  if (req.method === "POST" && pathname === "/admin/login") {
    const body = parseFormEncoded(await readBody(req));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      try {
        let adminUser = await dataLayer.getUserByEmail(ADMIN_SYNTHETIC_EMAIL);
        if (!adminUser) {
          adminUser = await dataLayer.createUser({ name: ADMIN_USERNAME, email: ADMIN_SYNTHETIC_EMAIL, password: ADMIN_PASSWORD });
        }
        await dataLayer.markUserVerified(ADMIN_SYNTHETIC_EMAIL);
      } catch (_err) { /* ignore */ }
      const session = await dataLayer.createSession(ADMIN_SYNTHETIC_EMAIL);
      setSessionCookie(res, session.token, session.expiresAt);
      res.writeHead(302, { Location: "/admin" });
      res.end();
      return;
    }
    res.writeHead(302, { Location: "/admin/login?error=" + encodeURIComponent("Invalid admin credentials") });
    res.end();
    return;
  }

  if (req.method === "POST" && pathname === "/admin/logout") {
    const cookies = parseCookies(req);
    if (cookies.session_token) {
      await dataLayer.deleteSession(cookies.session_token);
    }
    clearSessionCookie(res);
    res.writeHead(302, { Location: "/admin/login" });
    res.end();
    return;
  }

  if (req.method === "POST" && pathname === "/admin/orders/status") {
    if (!isAdmin(currentUser)) {
      res.writeHead(302, { Location: "/admin/login" }); res.end(); return;
    }
    const body = parseFormEncoded(await readBody(req));
    const orderCode = String(body.orderCode || "").trim();
    const status = String(body.status || "").trim();
    if (orderCode && ORDER_STATUS_OPTIONS.includes(status)) {
      db.prepare("UPDATE orders SET status = ? WHERE order_code = ?").run(status, orderCode);
    }
    res.writeHead(302, { Location: "/admin?section=orders" });
    res.end();
    return;
  }

  if (req.method === "POST" && pathname === "/admin/products/bulk-delete") {
    if (!isAdmin(currentUser)) {
      res.writeHead(302, { Location: "/admin/login" }); res.end(); return;
    }
    const raw = await readBody(req);
    const params = new URLSearchParams(raw);
    const slugs = params.getAll("slugs[]");
    if (slugs.length) {
      const placeholders = slugs.map(() => "?").join(",");
      db.prepare(`DELETE FROM products WHERE slug IN (${placeholders})`).run(...slugs);
    }
    res.writeHead(302, { Location: "/admin?section=products" });
    res.end();
    return;
  }

  if (req.method === "GET" && (pathname === "/login" || pathname === "/auth")) {
    html(res, 200, authPage({
      message: url.searchParams.get("message") || "",
      email: url.searchParams.get("email") || "",
      verified: url.searchParams.get("verified") === "1",
      error: url.searchParams.get("error") || ""
    }, currentUser));
    return;
  }

  if (req.method === "GET" && pathname === "/signup") {
    html(res, 200, signupPage({
      message: url.searchParams.get("message") || "",
      error: url.searchParams.get("error") || "",
      name: url.searchParams.get("name") || "",
      email: url.searchParams.get("email") || ""
    }, currentUser));
    return;
  }

  if (req.method === "POST" && pathname === "/auth/signup") {
    const body = parseFormEncoded(await readBody(req));
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!name || !email || !password) {
      res.writeHead(302, { Location: `/signup?error=${encodeURIComponent("Please fill all fields")}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}` });
      res.end();
      return;
    }
    const existing = await dataLayer.getUserByEmail(email);
    if (existing) {
      res.writeHead(302, { Location: `/signup?error=${encodeURIComponent("An account with this email already exists.")}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}` });
      res.end();
      return;
    }
    await dataLayer.createUser({ name, email, password });
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    await dataLayer.saveOtp({ email, code: otp, purpose: "register", expiresAt });
    try { await sendOtpEmail(email, otp); } catch (_e) { /* ignore mailer errors in dev */ }
    console.log(`[signup] OTP for ${email}: ${otp} - verify link: /auth/verify?email=${encodeURIComponent(email)}&token=${otp}`);
    html(res, 200, signupSuccessPage(email, currentUser));
    return;
  }

  if (req.method === "GET" && pathname === "/auth/verify") {
    const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
    const token = String(url.searchParams.get("token") || "").trim();
    if (!email || !token) {
      res.writeHead(302, { Location: "/login?error=" + encodeURIComponent("Invalid verification link.") });
      res.end();
      return;
    }
    const ok = await dataLayer.verifyOtp({ email, code: token, purpose: "register" });
    if (!ok) {
      res.writeHead(302, { Location: "/login?error=" + encodeURIComponent("Verification link invalid or expired.") });
      res.end();
      return;
    }
    await dataLayer.markUserVerified(email);
    res.writeHead(302, { Location: "/login?verified=1&email=" + encodeURIComponent(email) });
    res.end();
    return;
  }

  if (req.method === "POST" && pathname === "/auth/login") {
    const body = parseFormEncoded(await readBody(req));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) {
      res.writeHead(302, { Location: `/login?error=${encodeURIComponent("Please enter email and password.")}` });
      res.end();
      return;
    }
    const user = await dataLayer.getUserByEmail(email);
    if (!user) {
      res.writeHead(302, { Location: `/login?error=${encodeURIComponent("Account not found. Please sign up first.")}&email=${encodeURIComponent(email)}` });
      res.end();
      return;
    }
    if (!verifyPassword(password, user.password_hash)) {
      res.writeHead(302, { Location: `/login?error=${encodeURIComponent("Incorrect password.")}&email=${encodeURIComponent(email)}` });
      res.end();
      return;
    }
    const session = await dataLayer.createSession(email);
    setSessionCookie(res, session.token, session.expiresAt);
    res.writeHead(302, { Location: "/account" });
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/account") {
    if (!currentUser) {
      res.writeHead(302, { Location: "/login?message=Please+login+first" });
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
    const identifier = String(body.identifier || "").trim();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();

    // Hardcoded admin login (username-based)
    if (mode === "login" && identifier === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      try {
        let adminUser = await dataLayer.getUserByEmail(ADMIN_SYNTHETIC_EMAIL);
        if (!adminUser) {
          adminUser = await dataLayer.createUser({ name: ADMIN_USERNAME, email: ADMIN_SYNTHETIC_EMAIL, password: ADMIN_PASSWORD });
        }
        await dataLayer.markUserVerified(ADMIN_SYNTHETIC_EMAIL);
      } catch (_err) { /* ignore */ }
      const session = await dataLayer.createSession(ADMIN_SYNTHETIC_EMAIL);
      setSessionCookie(res, session.token, session.expiresAt);
      res.writeHead(302, { Location: "/admin" });
      res.end();
      return;
    }

    const email = (identifier && identifier.includes("@") ? identifier : String(body.email || "")).trim().toLowerCase();

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
      res.writeHead(302, { Location: "/admin/login" });
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
      res.writeHead(302, { Location: "/admin/login" });
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

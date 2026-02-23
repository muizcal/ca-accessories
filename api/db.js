const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Supports Neon, Supabase, Railway, or any Postgres URL
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }  // Required for Neon/cloud Postgres
});

const TABLES = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
    active INTEGER DEFAULT 1, created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS'), last_login TEXT
  );
  CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS')
  );
  CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, contact_person TEXT,
    phone TEXT, email TEXT, address TEXT,
    created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS')
  );
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, barcode TEXT UNIQUE,
    name TEXT NOT NULL, category_id INTEGER, supplier_id INTEGER,
    price REAL NOT NULL, cost_price REAL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0, low_stock_threshold INTEGER DEFAULT 10,
    unit TEXT DEFAULT 'piece', description TEXT, active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS'),
    updated_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS')
  );
  CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE, email TEXT,
    loyalty_points INTEGER DEFAULT 0, total_spent REAL DEFAULT 0,
    created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS')
  );
  CREATE TABLE IF NOT EXISTS discounts (
    id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, type TEXT NOT NULL,
    value REAL NOT NULL, min_purchase REAL DEFAULT 0, max_uses INTEGER,
    uses_count INTEGER DEFAULT 0, active INTEGER DEFAULT 1, expires_at TEXT,
    created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS')
  );
  CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY, ref TEXT UNIQUE NOT NULL, cashier_id INTEGER,
    customer_id INTEGER, discount_id INTEGER, subtotal REAL NOT NULL,
    discount_amount REAL DEFAULT 0, total REAL NOT NULL,
    payment_method TEXT DEFAULT 'cash', amount_paid REAL DEFAULT 0,
    change_given REAL DEFAULT 0, loyalty_points_earned INTEGER DEFAULT 0,
    loyalty_points_used INTEGER DEFAULT 0, status TEXT DEFAULT 'completed',
    terminal TEXT, created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS')
  );
  CREATE TABLE IF NOT EXISTS sale_items (
    id SERIAL PRIMARY KEY, sale_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL, product_code TEXT NOT NULL,
    quantity INTEGER NOT NULL, unit_price REAL NOT NULL, subtotal REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL, type TEXT NOT NULL,
    quantity_change INTEGER NOT NULL, quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL, reference TEXT, note TEXT, user_id INTEGER,
    created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS')
  );
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY, ref TEXT UNIQUE NOT NULL, supplier_id INTEGER,
    status TEXT DEFAULT 'pending', total_cost REAL DEFAULT 0, note TEXT,
    created_by INTEGER, created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS'),
    received_at TEXT
  );
  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
    quantity_ordered INTEGER NOT NULL, quantity_received INTEGER DEFAULT 0, unit_cost REAL NOT NULL
  );
`;

let initialized = false;

async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

async function initializeDB() {
  if (initialized) return;
  await query(TABLES);

  const { rows } = await query('SELECT COUNT(*) as c FROM users');
  if (parseInt(rows[0].c) === 0) {
    const ah = bcrypt.hashSync('Admin@CA2024!', 10);
    const ch = bcrypt.hashSync('Cashier@CA!', 10);
    await query(`INSERT INTO users (username,password,name,role) VALUES ($1,$2,$3,$4)`, ['admin', ah, 'Store Admin', 'admin']);
    await query(`INSERT INTO users (username,password,name,role) VALUES ($1,$2,$3,$4)`, ['cashier1', ch, 'Cashier One', 'cashier']);
    const cats = ['Engine & Oil','Tyres & Wheels','Batteries','Electrical','Body Parts','Brakes','Filters','Accessories'];
    for (const c of cats) await query(`INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING`, [c]);
    await query(`INSERT INTO suppliers (name,contact_person,phone,email) VALUES ($1,$2,$3,$4)`, ['C.A. Car Accessories Suppliers','Mr. Ahmed','07061909275','supply@ca-accessories.com']);
    await query(`INSERT INTO discounts (code,type,value,min_purchase) VALUES ($1,$2,$3,$4)`, ['WELCOME10','percentage',10,1000]);
    console.log('[DB] Seeded default data');
  }
  initialized = true;
}

module.exports = { query, initializeDB };

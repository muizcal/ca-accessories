const { query, initializeDB } = require('./db');
const { requireAuth } = require('./auth');
const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await initializeDB();
    const user = requireAuth(req, res); if (!user) return;
    if (req.method === 'GET') {
      const { search, phone } = req.query;
      if (phone) { const { rows } = await query('SELECT * FROM customers WHERE phone=$1', [phone]); return res.json(rows[0] || null); }
      let q = 'SELECT * FROM customers WHERE 1=1'; const p = [];
      if (search) { p.push(`%${search}%`); q += ` AND (name ILIKE $1 OR phone ILIKE $1)`; }
      q += ' ORDER BY name';
      const { rows } = await query(q, p); return res.json(rows);
    }
    if (req.method === 'POST') {
      const { name, phone, email } = req.body;
      try { const { rows } = await query('INSERT INTO customers (name,phone,email) VALUES ($1,$2,$3) RETURNING id', [name, phone||null, email||null]); return res.status(201).json({ id: rows[0].id, name, phone }); }
      catch(e) { return res.status(400).json({ error: 'Phone already registered' }); }
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
};

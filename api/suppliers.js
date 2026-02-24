const { query, initializeDB } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');
const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await initializeDB();
    const user = requireAuth(req, res); if (!user) return;
    if (req.method === 'GET') { const { rows } = await query('SELECT * FROM suppliers ORDER BY name'); return res.json(rows); }
    if (req.method === 'POST') {
      requireAdmin(req, res);
      const { name, contact_person, phone, email, address } = req.body;
      const { rows } = await query('INSERT INTO suppliers (name,contact_person,phone,email,address) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, contact_person||null, phone||null, email||null, address||null]);
      return res.status(201).json({ id: rows[0].id, name });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
};

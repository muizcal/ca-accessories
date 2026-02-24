const { query, initializeDB } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');
const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await initializeDB();
    const user = requireAuth(req, res); if (!user) return;
    if (req.method === 'GET') {
      const { code, subtotal } = req.query;
      if (code) {
        const { rows: [disc] } = await query(`SELECT * FROM discounts WHERE LOWER(code)=LOWER($1) AND active=1 AND (max_uses IS NULL OR uses_count < max_uses)`, [code]);
        if (!disc) return res.status(404).json({ error: 'Invalid promo code' });
        const amount = disc.type === 'percentage' ? parseFloat(subtotal||0) * disc.value / 100 : disc.value;
        return res.json({ discount: disc, amount: Math.min(amount, parseFloat(subtotal||0)) });
      }
      const { rows } = await query('SELECT * FROM discounts ORDER BY created_at DESC'); return res.json(rows);
    }
    if (req.method === 'PATCH') {
      requireAdmin(req, res);
      const { id } = req.query;
      const { active } = req.body;
      await query('UPDATE discounts SET active=$1 WHERE id=$2', [active, id]);
      return res.json({ message: 'Updated' });
    }
    if (req.method === 'POST') {
      requireAdmin(req, res);
      const { code, type, value, min_purchase, max_uses, expires_at } = req.body;
      try { const { rows } = await query('INSERT INTO discounts (code,type,value,min_purchase,max_uses,expires_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [code.toUpperCase(),type,value,min_purchase||0,max_uses||null,expires_at||null]); return res.status(201).json({ id: rows[0].id, code }); }
      catch(e) { return res.status(400).json({ error: 'Promo code already exists' }); }
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
};

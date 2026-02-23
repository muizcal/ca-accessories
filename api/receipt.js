const { query, initializeDB } = require('./db');
const { requireAuth } = require('./auth');
const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await initializeDB();
    const user = requireAuth(req, res); if (!user) return;
    const { id } = req.query;
    const { rows: [sale] } = await query(
      `SELECT s.*,u.name as cashier_name,c.name as customer_name
       FROM sales s
       LEFT JOIN users u ON s.cashier_id=u.id
       LEFT JOIN customers c ON s.customer_id=c.id
       WHERE s.id=$1`, [id]);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    const { rows: items } = await query('SELECT * FROM sale_items WHERE sale_id=$1 ORDER BY id', [id]);
    sale.items = items;
    res.json(sale);
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
};

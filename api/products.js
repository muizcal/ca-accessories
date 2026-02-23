const { query, initializeDB } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');
const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await initializeDB();
    const { id, lookup, action, search, category, low_stock } = req.query;

    // GET /api/products?lookup=CODE — scan barcode or product code
    if (req.method === 'GET' && lookup) {
      const user = requireAuth(req, res); if (!user) return;
      const { rows } = await query('SELECT p.*,c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE (p.code=$1 OR p.barcode=$1) AND p.active=1', [lookup]);
      if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
      return res.json(rows[0]);
    }

    // POST /api/products?action=adjust-stock&id=X — adjust stock
    if (req.method === 'POST' && action === 'adjust-stock') {
      const user = requireAdmin(req, res); if (!user) return;
      const { quantity_change, type, note } = req.body;
      const { rows: [product] } = await query('SELECT * FROM products WHERE id=$1', [id]);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      const newStock = product.stock + parseInt(quantity_change);
      if (newStock < 0) return res.status(400).json({ error: 'Stock cannot go below 0' });
      await query(`UPDATE products SET stock=$1, updated_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$2`, [newStock, id]);
      await query('INSERT INTO stock_movements (product_id,type,quantity_change,quantity_before,quantity_after,note,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, type, quantity_change, product.stock, newStock, note||null, user.id]);
      return res.json({ message: 'Stock adjusted', new_stock: newStock });
    }

    // GET /api/products — list all products
    if (req.method === 'GET') {
      const user = requireAuth(req, res); if (!user) return;
      if (id) {
        const { rows } = await query(`SELECT p.*,c.name as category_name,s.name as supplier_name FROM products p LEFT JOIN categories c ON p.category_id=c.id LEFT JOIN suppliers s ON p.supplier_id=s.id WHERE p.id=$1`, [id]);
        return res.json(rows[0] || null);
      }
      let q = `SELECT p.*,c.name as category_name,s.name as supplier_name FROM products p LEFT JOIN categories c ON p.category_id=c.id LEFT JOIN suppliers s ON p.supplier_id=s.id WHERE p.active=1`;
      const params = [];
      if (search) { params.push(`%${search}%`); q += ` AND (p.name ILIKE $${params.length} OR p.code ILIKE $${params.length} OR COALESCE(p.barcode,'') ILIKE $${params.length})`; }
      if (category) { params.push(category); q += ` AND p.category_id=$${params.length}`; }
      if (low_stock === 'true') q += ` AND p.stock <= p.low_stock_threshold`;
      q += ` ORDER BY p.name`;
      const { rows } = await query(q, params);
      return res.json(rows);
    }

    // POST — create product
    if (req.method === 'POST') {
      const user = requireAdmin(req, res); if (!user) return;
      const { code, barcode, name, category_id, supplier_id, price, cost_price, stock, low_stock_threshold, unit, description } = req.body;
      if (!code || !name || price == null) return res.status(400).json({ error: 'code, name and price required' });
      try {
        const { rows } = await query(`INSERT INTO products (code,barcode,name,category_id,supplier_id,price,cost_price,stock,low_stock_threshold,unit,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [code, barcode||null, name, category_id||null, supplier_id||null, price, cost_price||0, stock||0, low_stock_threshold||10, unit||'piece', description||null]);
        return res.status(201).json({ id: rows[0].id, message: 'Product created' });
      } catch(e) {
        if (e.message.includes('unique') || e.message.includes('duplicate')) return res.status(400).json({ error: 'Product code or barcode already exists' });
        throw e;
      }
    }

    // PUT — update product
    if (req.method === 'PUT') {
      const user = requireAdmin(req, res); if (!user) return;
      const { name, price, cost_price, category_id, supplier_id, low_stock_threshold, unit, description, barcode } = req.body;
      await query(`UPDATE products SET name=COALESCE($1,name), price=COALESCE($2,price), cost_price=COALESCE($3,cost_price), category_id=COALESCE($4,category_id), supplier_id=COALESCE($5,supplier_id), low_stock_threshold=COALESCE($6,low_stock_threshold), unit=COALESCE($7,unit), description=COALESCE($8,description), barcode=COALESCE($9,barcode), updated_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$10`,
        [name||null, price||null, cost_price||null, category_id||null, supplier_id||null, low_stock_threshold||null, unit||null, description||null, barcode||null, id]);
      return res.json({ message: 'Updated' });
    }

    // DELETE — deactivate product
    if (req.method === 'DELETE') {
      const user = requireAdmin(req, res); if (!user) return;
      await query('UPDATE products SET active=0 WHERE id=$1', [id]);
      return res.json({ message: 'Deactivated' });
    }

  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
};

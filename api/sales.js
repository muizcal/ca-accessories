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
      const { id, limit = 50, offset = 0 } = req.query;
      if (id) {
        const { rows: [sale] } = await query(`SELECT s.*,u.name as cashier_name,c.name as customer_name FROM sales s LEFT JOIN users u ON s.cashier_id=u.id LEFT JOIN customers c ON s.customer_id=c.id WHERE s.id=$1`, [id]);
        if (!sale) return res.status(404).json({ error: 'Sale not found' });
        const { rows: items } = await query('SELECT * FROM sale_items WHERE sale_id=$1', [id]);
        sale.items = items;
        return res.json(sale);
      }
      const { rows: sales } = await query(`SELECT s.*,u.name as cashier_name,c.name as customer_name FROM sales s LEFT JOIN users u ON s.cashier_id=u.id LEFT JOIN customers c ON s.customer_id=c.id WHERE s.status!='voided' ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`, [parseInt(limit), parseInt(offset)]);
      const { rows: [tot] } = await query(`SELECT COUNT(*) as c FROM sales WHERE status!='voided'`);
      return res.json({ sales, total: parseInt(tot.c) });
    }

    if (req.method === 'POST') {
      const { items, customer_id, discount_code, payment_method, amount_paid, terminal } = req.body;
      if (!items || !items.length) return res.status(400).json({ error: 'No items' });

      let subtotal = 0;
      const saleItems = [];
      for (const item of items) {
        const { rows: [product] } = await query('SELECT * FROM products WHERE id=$1 AND active=1', [item.product_id]);
        if (!product) return res.status(400).json({ error: `Product ${item.product_id} not found` });
        if (product.stock < item.quantity) return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
        subtotal += product.price * item.quantity;
        saleItems.push({ product, quantity: item.quantity, unit_price: product.price, subtotal: product.price * item.quantity });
      }

      let discount_amount = 0, discount_id = null;
      if (discount_code) {
        const { rows: [disc] } = await query(`SELECT * FROM discounts WHERE LOWER(code)=LOWER($1) AND active=1 AND (max_uses IS NULL OR uses_count < max_uses)`, [discount_code]);
        if (disc && subtotal >= disc.min_purchase) {
          discount_amount = disc.type === 'percentage' ? subtotal * disc.value / 100 : disc.value;
          discount_amount = Math.min(discount_amount, subtotal);
          discount_id = disc.id;
          await query('UPDATE discounts SET uses_count=uses_count+1 WHERE id=$1', [disc.id]);
        }
      }

      const total = Math.max(0, subtotal - discount_amount);
      const change = Math.max(0, (amount_paid || 0) - total);
      const points_earned = Math.floor(total / 100);
      const ref = 'CA-' + Date.now().toString(36).toUpperCase();

      const { rows: [saleRow] } = await query(
        `INSERT INTO sales (ref,cashier_id,customer_id,discount_id,subtotal,discount_amount,total,payment_method,amount_paid,change_given,loyalty_points_earned,terminal) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [ref, user.id, customer_id||null, discount_id, subtotal, discount_amount, total, payment_method||'cash', amount_paid||0, change, points_earned, terminal||'Main']
      );
      const saleId = saleRow.id;

      for (const item of saleItems) {
        await query('INSERT INTO sale_items (sale_id,product_id,product_name,product_code,quantity,unit_price,subtotal) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [saleId, item.product.id, item.product.name, item.product.code, item.quantity, item.unit_price, item.subtotal]);
        const newStock = item.product.stock - item.quantity;
        await query(`UPDATE products SET stock=$1, updated_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$2`, [newStock, item.product.id]);
        await query('INSERT INTO stock_movements (product_id,type,quantity_change,quantity_before,quantity_after,reference,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [item.product.id, 'sale', -item.quantity, item.product.stock, newStock, ref, user.id]);
      }

      if (customer_id) {
        await query('UPDATE customers SET loyalty_points=loyalty_points+$1, total_spent=total_spent+$2 WHERE id=$3', [points_earned, total, customer_id]);
      }

      return res.status(201).json({ saleId, ref, total, change, pointsEarned: points_earned, subtotal, discount_amount });
    }
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
};

const { query, initializeDB } = require('./db');
const { requireAuth } = require('./auth');
const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await initializeDB();
    const user = requireAuth(req, res); if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const { rows: [todaySales] } = await query(`SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as count FROM sales WHERE DATE(created_at::timestamp)=$1 AND status='completed'`, [today]);
    const { rows: [weekSales] } = await query(`SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as count FROM sales WHERE created_at::timestamp >= NOW()-INTERVAL '7 days' AND status='completed'`);
    const { rows: [monthSales] } = await query(`SELECT COALESCE(SUM(total),0) as revenue FROM sales WHERE TO_CHAR(created_at::timestamp,'YYYY-MM')=TO_CHAR(NOW(),'YYYY-MM') AND status='completed'`);
    const { rows: [tp] } = await query(`SELECT COUNT(*) as c FROM products WHERE active=1`);
    const { rows: [ls] } = await query(`SELECT COUNT(*) as c FROM products WHERE stock <= low_stock_threshold AND active=1`);
    const { rows: [os] } = await query(`SELECT COUNT(*) as c FROM products WHERE stock=0 AND active=1`);
    const { rows: topProducts } = await query(`SELECT si.product_name,SUM(si.quantity) as sold,SUM(si.subtotal) as revenue FROM sale_items si JOIN sales s ON si.sale_id=s.id WHERE s.status='completed' GROUP BY si.product_name ORDER BY sold DESC LIMIT 5`);
    const { rows: recentSales } = await query(`SELECT s.*,u.name as cashier_name FROM sales s LEFT JOIN users u ON s.cashier_id=u.id WHERE s.status='completed' ORDER BY s.created_at DESC LIMIT 10`);
    const { rows: lowStockItems } = await query(`SELECT id,code,name,stock,low_stock_threshold FROM products WHERE stock <= low_stock_threshold AND active=1 ORDER BY stock ASC`);
    res.json({ todaySales, weekSales, monthSales, totalProducts: parseInt(tp.c), lowStock: parseInt(ls.c), outOfStock: parseInt(os.c), topProducts, recentSales, lowStockItems });
    // Purchase orders
    if (req.method === 'GET' && req.query.type === 'purchase-orders') {
      const { rows: orders } = await query(`SELECT po.*,s.name as supplier_name,u.name as created_by_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id=s.id LEFT JOIN users u ON po.created_by=u.id ORDER BY po.created_at DESC`);
      return res.json(orders);
    }
    if (req.method === 'POST' && req.query.type === 'purchase-orders') {
      const { supplier_id, items, note } = req.body;
      if (!supplier_id || !items || !items.length) return res.status(400).json({ error: 'Supplier and items required' });
      const ref = 'PO-' + Date.now().toString(36).toUpperCase();
      const { rows: [po] } = await query('INSERT INTO purchase_orders (ref,supplier_id,note,created_by) VALUES ($1,$2,$3,$4) RETURNING id', [ref, supplier_id, note||null, user.id]);
      let totalCost = 0;
      for (const item of items) {
        await query('INSERT INTO purchase_order_items (order_id,product_id,quantity_ordered,unit_cost) VALUES ($1,$2,$3,$4)', [po.id, item.product_id, item.quantity, item.unit_cost]);
        totalCost += item.quantity * item.unit_cost;
      }
      await query('UPDATE purchase_orders SET total_cost=$1 WHERE id=$2', [totalCost, po.id]);
      return res.status(201).json({ id: po.id, ref });
    }
    if (req.method === 'POST' && req.query.type === 'receive-po') {
      const { id } = req.query;
      const { rows: [order] } = await query('SELECT * FROM purchase_orders WHERE id=$1', [id]);
      if (!order || order.status === 'received') return res.status(400).json({ error: 'Order already received or not found' });
      const { rows: items } = await query('SELECT * FROM purchase_order_items WHERE order_id=$1', [id]);
      for (const item of items) {
        const { rows: [prod] } = await query('SELECT stock FROM products WHERE id=$1', [item.product_id]);
        if (prod) {
          await query('UPDATE products SET stock=stock+$1 WHERE id=$2', [item.quantity_ordered, item.product_id]);
          await query('UPDATE purchase_order_items SET quantity_received=quantity_ordered WHERE id=$1', [item.id]);
        }
      }
      await query("UPDATE purchase_orders SET status='received',received_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$1", [id]);
      return res.json({ message: 'Order received, stock updated' });
    }

  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
};
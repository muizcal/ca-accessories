const bcrypt = require('bcryptjs');
const { query, initializeDB } = require('./db');
const { requireAdmin } = require('./auth');
const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await initializeDB();
    const user = requireAdmin(req, res); if (!user) return;
    if (req.method === 'GET') { const { rows } = await query('SELECT id,username,name,role,active,created_at,last_login FROM users ORDER BY name'); return res.json(rows); }
    if (req.method === 'POST') {
      const { username, password, name, role } = req.body;
      try { const hash = bcrypt.hashSync(password, 10); const { rows } = await query('INSERT INTO users (username,password,name,role) VALUES ($1,$2,$3,$4) RETURNING id', [username,hash,name,role]); return res.status(201).json({ id: rows[0].id, username, name, role }); }
      catch(e) { return res.status(400).json({ error: 'Username already exists' }); }
    }
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (parseInt(id) === user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
      await query('DELETE FROM users WHERE id=$1', [id]); return res.json({ message: 'Deleted' });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
};

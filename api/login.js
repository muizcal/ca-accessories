const bcrypt = require('bcryptjs');
const { query, initializeDB } = require('./db');
const { signToken } = require('./auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  try {
    await initializeDB();
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const { rows } = await query('SELECT * FROM users WHERE LOWER(username)=LOWER($1) AND active=1', [username]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid username or password' });
    await query("UPDATE users SET last_login=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=$1", [user.id]);
    const token = signToken(user);
    res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
};

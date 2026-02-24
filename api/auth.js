const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'CA_POS_SECRET_2024';

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, username: user.username, name: user.name }, SECRET, { expiresIn: '12h' });
}

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(auth.slice(7), SECRET);
  } catch(e) {
    return null;
  }
}

function requireAuth(req, res) {
  const user = verifyToken(req);
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  return user;
}

function requireAdmin(req, res) {
  const user = verifyToken(req);
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  if (!['admin','manager'].includes(user.role)) { res.status(403).json({ error: 'Admin required' }); return null; }
  return user;
}

module.exports = { signToken, verifyToken, requireAuth, requireAdmin };

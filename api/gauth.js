// Connexion Google « une fois pour toutes » : échange du code d'autorisation, renouvellement silencieux, déconnexion.
const { setSession, clearSession, session, allowed } = require('./_session');

const CLIENT_ID = '801369190574-3fls5l6a0kbumk8usql1s2hsh95hs7vo.apps.googleusercontent.com';

async function tokenCall(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}
function emailOf(idToken) {
  try { return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8')).email || ''; } catch (e) { return ''; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (req.method === 'GET') return res.status(200).json({ configured: !!secret, session: !!session(req) });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!secret) return res.status(501).json({ error: 'not-configured' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const action = body.action || 'refresh';

  if (action === 'code') {
    const origin = 'https://' + req.headers.host;
    const t = await tokenCall({ code: body.code, client_id: CLIENT_ID, client_secret: secret, redirect_uri: origin + '/', grant_type: 'authorization_code' });
    if (!t.ok) return res.status(400).json({ error: 'exchange', message: t.j.error_description || t.j.error || t.status });
    const email = emailOf(t.j.id_token);
    if (!allowed(email)) return res.status(403).json({ error: 'account', message: 'Compte non autorisé : ' + email });
    const prev = session(req);
    const rt = t.j.refresh_token || (prev && prev.email === email ? prev.rt : '');
    if (rt) setSession(res, { rt, email, at: Date.now() });
    return res.status(200).json({ access_token: t.j.access_token, expires_in: t.j.expires_in, email, scope: t.j.scope, persistent: !!rt });
  }
  if (action === 'refresh') {
    const s = session(req);
    if (!s) return res.status(401).json({ error: 'no-session' });
    const t = await tokenCall({ refresh_token: s.rt, client_id: CLIENT_ID, client_secret: secret, grant_type: 'refresh_token' });
    if (!t.ok) { if (t.j.error === 'invalid_grant') clearSession(res); return res.status(401).json({ error: 'refresh', message: t.j.error_description || t.j.error }); }
    return res.status(200).json({ access_token: t.j.access_token, expires_in: t.j.expires_in, email: s.email, scope: t.j.scope });
  }
  if (action === 'logout') {
    const s = session(req);
    if (s) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(s.rt), { method: 'POST' }).catch(() => {});
    clearSession(res);
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: 'action' });
};

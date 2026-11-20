// Fonction serveur Vercel : résume la transcription d'un rendez-vous avec Gemini.
// Variables d'environnement (Vercel › Settings › Environment Variables) :
//   GEMINI_API_KEY  clé créée sur https://aistudio.google.com/apikey (obligatoire)
//   ATELIER_TOKEN   code d'accès saisi dans Réglages de l'Atelier (recommandé)
//   GEMINI_MODEL    facultatif, par défaut gemini-flash-latest
module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  const token = process.env.ATELIER_TOKEN;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ configured: !!key, protected: !!token });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!key) return res.status(501).json({ error: 'not-configured' });
  if (token && req.headers['x-atelier-token'] !== token) return res.status(401).json({ error: 'token' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const prompt = body && body.prompt;
  if (!prompt || typeof prompt !== 'string' || prompt.length > 400000) return res.status(400).json({ error: 'prompt' });
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'gemini', status: r.status, message: (j.error && j.error.message) || '' });
    const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((p) => p.text || '').join('').trim();
    if (!text) return res.status(502).json({ error: 'empty' });
    return res.status(200).json({ text, model });
  } catch (e) {
    return res.status(502).json({ error: 'network', message: String(e && e.message || e) });
  }
};

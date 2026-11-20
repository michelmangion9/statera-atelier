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
  // Modèle principal puis repli si Gemini est saturé (503) ou limité (429).
  const models = [process.env.GEMINI_MODEL || 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'].filter((m, i, l) => l.indexOf(m) === i);
  let last = null; const tried = [];
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const t0 = Date.now();
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
          method: 'POST', signal: AbortSignal.timeout(40000),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } } })
        });
        const j = await r.json().catch(() => ({}));
        tried.push(model + ':' + r.status + ':' + (Date.now() - t0) + 'ms' + (r.ok ? '' : ':' + ((j.error && j.error.message) || '').slice(0, 120)));
        if (r.ok) {
          const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((p) => p.text || '').join('').trim();
          if (text) return res.status(200).json({ text, model, tried });
          last = { status: 502, message: 'Réponse vide' };
          break;
        }
        last = { status: r.status, message: (j.error && j.error.message) || '' };
        if (r.status === 503 || r.status === 429 || r.status === 500) { if (attempt === 0) await new Promise((ok) => setTimeout(ok, 1500)); continue; }
        if (r.status === 404) break; // modèle inconnu : on passe au suivant
        return res.status(502).json({ error: 'gemini', status: r.status, message: last.message, tried });
      } catch (e) { last = { status: 0, message: String(e && e.message || e) }; tried.push(model + ':err:' + last.message.slice(0, 80)); }
    }
  }
  return res.status(502).json({ error: 'gemini', status: last && last.status, message: (last && last.message) || 'Gemini indisponible', tried });
};

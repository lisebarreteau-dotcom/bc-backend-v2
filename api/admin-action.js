// api/admin-action.js — Box'Concours by Jump-Addict
// Coffre-fort sécurisé pour les actions admin : le mot de passe et la clé
// secrète Supabase ne sont JAMAIS visibles côté site, uniquement ici.

const SUPABASE_URL = 'https://mdrappwsebplprznqslm.supabase.co';

const ALLOWED_TABLES = [
  'reservations', 'users', 'annonces', 'concours',
  'demandes_retrait', 'notifications_admin', 'notifications',
  'avis', 'suspensions', 'messages'
];

async function supabaseAdminRequest(path, options = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await resp.text();
  const json = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    throw new Error(typeof json === 'object' ? JSON.stringify(json) : String(json));
  }
  return json;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { password, table, operation, query, body } = req.body || {};

  // Vérification du mot de passe admin, uniquement côté serveur désormais.
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  if (!ALLOWED_TABLES.includes(table)) {
    return res.status(400).json({ error: `Table non autorisée : ${table}` });
  }

  try {
    const path = `${table}${query ? '?' + query : ''}`;
    let options = {};

    if (operation === 'select') {
      options.method = 'GET';
    } else if (operation === 'update') {
      options.method = 'PATCH';
      options.body = JSON.stringify(body || {});
    } else if (operation === 'insert') {
      options.method = 'POST';
      options.body = JSON.stringify(body || {});
    } else if (operation === 'delete') {
      options.method = 'DELETE';
    } else {
      return res.status(400).json({ error: `Opération non autorisée : ${operation}` });
    }

    const result = await supabaseAdminRequest(path, options);
    return res.status(200).json({ data: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
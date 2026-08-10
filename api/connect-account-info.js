// ═══════════════════════════════════════════════════════════════════
// api/connect-account-info.js
// À ajouter dans le repo bc-backend-v2, à côté de connect-onboarding.js.
//
// Rôle : renvoie les 4 derniers chiffres de l'IBAN lié au compte Stripe
// Connect d'un adhérent, pour affichage dans la fenêtre de confirmation
// avant un retrait ("virement vers IBAN se terminant par 1234").
// Interroge Stripe à chaque appel (pas de cache en base), pour être
// toujours à jour même si l'adhérent a changé son IBAN entre-temps.
//
// ⚠️ MODE TEST pour l'instant : utilise STRIPE_SECRET_KEY_TEST.
// À remplacer par STRIPE_SECRET_KEY une fois testé et prêt pour la prod.
// ═══════════════════════════════════════════════════════════════════

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);

const SUPABASE_URL = 'https://mdrappwsebplprznqslm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseHeaders(extra = {}) {
  return { apikey: SUPABASE_SERVICE_ROLE_KEY, ...extra };
}

async function supabaseRequest(path, options = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...supabaseHeaders(), 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${path} error: ${resp.status} ${text}`);
  }
  return resp.status === 204 ? null : resp.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: 'userId manquant' });
  }

  try {
    const rows = await supabaseRequest(`users?id=eq.${userId}&select=stripe_connect_id,solde_transit`);
    const user = rows && rows[0];
    if (!user || !user.stripe_connect_id) {
      return res.status(404).json({ error: 'Aucun compte Stripe Connect lié pour cet utilisateur' });
    }

    const externalAccounts = await stripe.accounts.listExternalAccounts(
      user.stripe_connect_id,
      { object: 'bank_account', limit: 1 }
    );
    const bankAccount = externalAccounts.data[0];

    return res.status(200).json({
      ok: true,
      solde: user.solde_transit || 0,
      iban_last4: bankAccount ? bankAccount.last4 : null,
    });
  } catch (e) {
    console.error('Erreur connect-account-info:', e);
    return res.status(500).json({ error: e.message });
  }
}

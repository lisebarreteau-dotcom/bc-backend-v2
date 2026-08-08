// ═══════════════════════════════════════════════════════════════════
// api/connect-onboarding.js
// À ajouter dans le repo bc-backend-v2 (à côté de api/webhook.js),
// puis déployé sur Vercel.
//
// Rôle : appelé quand un adhérent clique sur "Demander un retrait" et
// n'a pas encore de compte Stripe Connect lié (users.stripe_connect_id
// est NULL). Crée le compte Connect Express s'il n'existe pas encore,
// puis génère un lien d'onboarding Stripe (formulaire hébergé par
// Stripe : identité + IBAN) et le renvoie au frontend pour redirection.
//
// ⚠️ MODE TEST pour l'instant : utilise STRIPE_SECRET_KEY_TEST.
// Pour passer en production, remplacer par STRIPE_SECRET_KEY (la clé
// live existante) une fois tout testé et validé.
//
// ⚠️ Même piège que les autres endpoints : la clé secrète Supabase
// (sb_secret_...) doit être envoyée UNIQUEMENT dans l'en-tête `apikey`,
// jamais dans `Authorization: Bearer`.
// ═══════════════════════════════════════════════════════════════════

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);

const SUPABASE_URL = 'https://mdrappwsebplprznqslm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// URL de base du site, utilisée pour les redirections Stripe après onboarding.
// À adapter si le domaine change.
const SITE_URL = 'https://boxconcours.fr';

function supabaseHeaders(extra = {}) {
  return { apikey: SUPABASE_SERVICE_ROLE_KEY, ...extra };
}

async function supabaseRequest(path, options = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders(),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
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
    // 1. Récupérer l'utilisateur
    const rows = await supabaseRequest(
      `users?id=eq.${userId}&select=id,email,nom,prenom,stripe_connect_id`
    );
    const user = rows && rows[0];
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    let accountId = user.stripe_connect_id;

    // 2. Créer le compte Connect Express s'il n'existe pas encore
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'FR',
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: {
          box_concours_user_id: user.id,
        },
      });
      accountId = account.id;

      // Sauvegarder immédiatement, avant même la fin de l'onboarding —
      // pour ne jamais recréer un deuxième compte pour la même personne
      // si elle relance une demande de retrait avant d'avoir terminé.
      await supabaseRequest(`users?id=eq.${userId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ stripe_connect_id: accountId }),
      });
    }

    // 3. Générer le lien d'onboarding (à usage unique, valable quelques minutes)
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${SITE_URL}/?stripe_onboarding=refresh`,
      return_url: `${SITE_URL}/?stripe_onboarding=complete`,
      type: 'account_onboarding',
    });

    return res.status(200).json({ ok: true, url: accountLink.url, accountId });
  } catch (e) {
    console.error('Erreur connect-onboarding:', e);
    return res.status(500).json({ error: e.message });
  }
}

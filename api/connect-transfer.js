// ═══════════════════════════════════════════════════════════════════
// api/connect-transfer.js
// À ajouter dans le repo bc-backend-v2, à côté des autres fichiers connect-*.
//
// Rôle : appelé quand l'adhérent clique sur "Confirmer le virement" dans
// la fenêtre de confirmation (montant + IBAN affichés au préalable via
// connect-account-info.js). Déclenche le VRAI virement Stripe vers son
// compte Connect, remet son solde_transit à 0, et enregistre la demande
// comme traitée — remplace le traitement manuel qui se faisait jusqu'ici
// à la main depuis l'onglet admin "Virements".
//
// ⚠️ MODE TEST pour l'instant : utilise STRIPE_SECRET_KEY_TEST.
// À remplacer par STRIPE_SECRET_KEY une fois testé et prêt pour la prod.
//
// ⚠️ Même piège que les autres endpoints Supabase : la clé secrète
// (sb_secret_...) doit être envoyée UNIQUEMENT dans l'en-tête `apikey`.
// ═══════════════════════════════════════════════════════════════════

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);

const SUPABASE_URL = 'https://mdrappwsebplprznqslm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKEND_EMAIL_URL = 'https://bc-backend-v2.vercel.app/api/send-email';

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
    // 1. Récupérer l'utilisateur — toujours relire le solde en base ici,
    // jamais faire confiance à un montant envoyé par le frontend, pour
    // éviter qu'un montant trafiqué déclenche un virement erroné.
    const rows = await supabaseRequest(
      `users?id=eq.${userId}&select=id,email,nom,prenom,stripe_connect_id,solde_transit`
    );
    const user = rows && rows[0];
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (!user.stripe_connect_id) {
      return res.status(400).json({ error: 'Aucun compte Stripe Connect lié — onboarding requis avant tout retrait' });
    }
    const montant = user.solde_transit || 0;
    if (montant <= 0) {
      return res.status(400).json({ error: 'Solde transit vide, rien à virer' });
    }

    // 2. Déclencher le vrai virement Stripe (transfert interne, quasi
    // instantané) — Stripe se charge ensuite automatiquement du payout
    // vers la banque de l'adhérent selon son calendrier de virement.
    const transfer = await stripe.transfers.create({
      amount: Math.round(montant * 100), // Stripe travaille en centimes
      currency: 'eur',
      destination: user.stripe_connect_id,
      description: `Retrait Box'Concours - ${user.prenom || ''} ${user.nom || ''}`.trim(),
      metadata: {
        box_concours_user_id: user.id,
      },
    });

    // 3. Remettre le solde transit à 0 et enregistrer la demande comme traitée
    await supabaseRequest(`users?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ solde_transit: 0 }),
    });

    await supabaseRequest('demandes_retrait', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: user.id,
        nom: `${user.prenom || ''} ${user.nom || ''}`.trim(),
        email: user.email || '',
        montant,
        statut: 'traite',
        traite_at: new Date().toISOString(),
        stripe_transfer_id: transfer.id,
      }),
    });

    // 4. Notifier l'adhérent (in-app + email) et l'admin
    await supabaseRequest('notifications', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: user.id,
        type: 'retrait_effectue',
        titre: 'Virement effectué 🏦',
        message: `Votre retrait de ${montant}€ a été envoyé vers votre compte bancaire.`,
        lien: 'profil:coordonnees',
      }),
    });

    if (user.email) {
      await fetch(BACKEND_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'retrait_effectue',
          to: user.email,
          nom: user.prenom || user.email,
          details: { montant: montant + '€', iban_partiel: '' },
        }),
      }).catch(() => {});
    }

    await supabaseRequest('notifications_admin', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        type: 'virement_stripe_effectue',
        titre: 'Virement Stripe Connect effectué 🏦',
        message: `${montant}€ virés à ${user.prenom || ''} ${user.nom || ''} via Stripe Connect (${transfer.id}).`,
        lien: 'admin:virements',
      }),
    }).catch(() => {});

    return res.status(200).json({ ok: true, montant, transferId: transfer.id });
  } catch (e) {
    console.error('Erreur connect-transfer:', e);
    return res.status(500).json({ error: e.message });
  }
}

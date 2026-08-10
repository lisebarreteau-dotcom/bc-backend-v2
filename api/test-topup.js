// ═══════════════════════════════════════════════════════════════════
// api/test-topup.js
// TEMPORAIRE — outil de test uniquement, à supprimer une fois Stripe
// Connect validé et passé en production. Ne JAMAIS utiliser en Live
// (le token tok_bypassPending n'existe qu'en mode test de toute façon,
// Stripe refuserait automatiquement en Live).
//
// Rôle : crédite le solde Stripe disponible (mode test) avec de la
// fausse monnaie, pour pouvoir tester de vrais transferts Connect sans
// se battre avec le format brut de l'API Stripe à la main.
// ═══════════════════════════════════════════════════════════════════

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const charge = await stripe.charges.create({
      amount: 10000, // 100,00€
      currency: 'eur',
      source: 'tok_bypassPending',
      description: 'Fonds de test Box Concours',
    });
    return res.status(200).json({ ok: true, status: charge.status, id: charge.id });
  } catch (e) {
    console.error('Erreur test-topup:', e);
    return res.status(500).json({ error: e.message });
  }
}

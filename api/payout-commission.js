// ═══════════════════════════════════════════════════════════════════
// api/payout-commission.js
// À ajouter dans le repo bc-backend-v2, à côté de connect-transfer.js.
//
// Rôle : déclenche un virement Stripe réel (payout) vers le compte
// bancaire pro de Lise, pour un montant de commission donné. Utilisé
// notamment par rembourserTransit() côté frontend, dans le cas précis
// d'une annulation cavalier <24h — seul cas de remboursement où une
// commission (3€/j/box) reste effectivement acquise à la plateforme
// (contrairement aux remboursements épidémie/concours annulé, qui
// remboursent la totalité, sans commission conservée).
//
// Non exposé publiquement sans contrôle : appelé uniquement depuis
// l'admin (via adminRequest-style logique), jamais accessible à un
// simple adhérent.
// ═══════════════════════════════════════════════════════════════════

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { password, montant, description } = req.body || {};

  // Même mot de passe admin que les autres actions sensibles.
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  if (!montant || montant <= 0) {
    return res.status(400).json({ error: 'Montant invalide' });
  }

  try {
    const payout = await stripe.payouts.create({
      amount: Math.round(montant * 100),
      currency: 'eur',
      description: description || 'Commission Box\'Concours',
    });
    return res.status(200).json({ ok: true, payoutId: payout.id, montant });
  } catch (e) {
    console.error('Erreur payout-commission:', e);
    return res.status(500).json({ error: e.message });
  }
}

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
// ✅ MODE LIVE — utilise STRIPE_SECRET_KEY (clé live).
//
// ⚠️ Même piège que les autres endpoints Supabase : la clé secrète
// (sb_secret_...) doit être envoyée UNIQUEMENT dans l'en-tête `apikey`.
//
// 🆕 Ajout : si le virement Stripe échoue (par exemple solde Stripe
// insuffisant), Lise reçoit désormais un email d'alerte automatique —
// avant ce correctif, seul l'adhérent voyait un message d'erreur sur le
// moment, et si personne ne réessayait, le souci passait inaperçu côté
// admin.
// ═══════════════════════════════════════════════════════════════════
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SUPABASE_URL = 'https://mdrappwsebplprznqslm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKEND_EMAIL_URL = 'https://bc-backend-v2.vercel.app/api/send-email';
const ADMIN_EMAIL = 'lisebarreteau@gmail.com';

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
  // Certaines réponses Supabase renvoient un corps vide avec un statut
  // 200 au lieu de 204 (comportement pas garanti à 100%) — on ne tente
  // .json() que si le corps n'est pas vide, pour éviter un crash
  // "Unexpected end of JSON input" sur une réponse pourtant réussie.
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

// Alerte Lise par email + notification admin quand un virement échoue.
// Volontairement non bloquant (.catch) : un souci d'envoi de mail ne
// doit jamais empêcher de renvoyer une réponse d'erreur propre au site.
async function alerterEchecVirement({ user, montant, erreur }) {
  const nomAffiche = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email : 'Utilisateur inconnu';
  try {
    await fetch(BACKEND_EMAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'admin_echec_virement',
        to: ADMIN_EMAIL,
        nom: 'Admin',
        details: {
          adherent: nomAffiche,
          montant: (montant != null ? montant + '€' : 'inconnu'),
          erreur: erreur || 'Erreur inconnue',
        },
      }),
    });
  } catch (eEmail) {
    console.error('Erreur envoi email échec virement:', eEmail);
  }
  if (user) {
    await supabaseRequest('notifications_admin', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        type: 'virement_stripe_echec',
        titre: 'Échec d’un virement Stripe Connect ⚠️',
        message: `Le virement de ${montant}€ vers ${nomAffiche} a échoué : ${erreur || 'erreur inconnue'}.`,
        lien: 'admin:virements',
      }),
    }).catch(eNotif => console.error('Erreur notification admin échec virement:', eNotif));
  }
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

  // Déclarés ici (et non avec `const` dans le bloc try) pour rester
  // accessibles dans le catch et pouvoir alerter Lise avec le bon
  // montant et le bon nom d'adhérent, même en cas d'échec du virement.
  let user = null;
  let montant = null;

  try {
    // 1. Récupérer l'utilisateur — toujours relire le solde en base ici,
    // jamais faire confiance à un montant envoyé par le frontend, pour
    // éviter qu'un montant trafiqué déclenche un virement erroné.
    const rows = await supabaseRequest(
      `users?id=eq.${userId}&select=id,email,nom,prenom,stripe_connect_id,solde_transit`
    );
    user = rows && rows[0];
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (!user.stripe_connect_id) {
      return res.status(400).json({ error: 'Aucun compte Stripe Connect lié — onboarding requis avant tout retrait' });
    }
    montant = user.solde_transit || 0;
    if (montant <= 0) {
      return res.status(400).json({ error: 'Solde transit vide, rien à virer' });
    }

    // 2. Déclencher le vrai virement Stripe (transfert interne, quasi
    // instantané) — Stripe se charge ensuite automatiquement du payout
    // vers la banque de l'adhérent selon son calendrier de virement.
    let transfer;
    try {
      transfer = await stripe.transfers.create({
        amount: Math.round(montant * 100), // Stripe travaille en centimes
        currency: 'eur',
        destination: user.stripe_connect_id,
        description: `Retrait Box'Concours - ${user.prenom || ''} ${user.nom || ''}`.trim(),
        metadata: {
          box_concours_user_id: user.id,
        },
      });
    } catch (eTransfer) {
      // Cas le plus probable : solde Stripe de la plateforme insuffisant.
      // Le virement n'a pas eu lieu, le solde_transit de l'adhérent reste
      // inchangé (rien n'est perdu) — mais Lise doit être prévenue pour
      // pouvoir réapprovisionner Stripe et faire réessayer l'adhérent.
      console.error('Erreur transfer Stripe connect-transfer:', eTransfer);
      await alerterEchecVirement({ user, montant, erreur: eTransfer.message });
      return res.status(500).json({ error: eTransfer.message });
    }

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

    // 3bis. Générer la facture correspondant à ce virement
    // Non bloquant à dessein : un souci de facturation ne doit jamais
    // empêcher le virement réel ni les notifications à l'adhérent.
    try {
      const numero = await supabaseRequest('rpc/generate_facture_numero', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await supabaseRequest('factures', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          numero,
          user_id: user.id,
          nom_client: `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email,
          concours_nom: '',
          concours_lieu: '',
          date_debut: null,
          date_fin: null,
          montant,
          reservation_id: null,
          transfer_ref: transfer.id,
        }),
      });
    } catch (eFacture) {
      console.error('Erreur génération facture connect-transfer:', eFacture);
    }

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
    // Erreurs hors virement Stripe (ex : Supabase injoignable). On alerte
    // aussi dans ce cas si on avait déjà identifié l'utilisateur.
    console.error('Erreur connect-transfer:', e);
    await alerterEchecVirement({ user, montant, erreur: e.message });
    return res.status(500).json({ error: e.message });
  }
}

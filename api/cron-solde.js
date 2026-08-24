// ═══════════════════════════════════════════════════════════════════
// api/cron-solde.js
// À ajouter dans le repo bc-backend-v2 (à côté de api/cron-avis.js),
// puis déployé sur Vercel. Même mécanique que cron-avis.js : une seule
// exécution programmée par jour (voir vercel.json), ~8h heure de Paris.
//
// Reprend EXACTEMENT la même logique métier que la fonction admin
// marquerVirementEffectue() du frontend (traitement manuel) :
// montantSousLoueur = Math.round(montant * 21/24), écrit sur
// users.solde_transit, puis reservations.virement_effectue = true.
//
// ⚠️ CORRECTIF IMPORTANT : le crédit se déclenche désormais le
// lendemain de la fin RÉELLE DU CONCOURS (concours.date_fin), et non
// plus le lendemain du dernier jour loué par chaque réservation
// individuelle.
//
// ✅ NOUVEAU : le compte Stripe a été passé en virements MANUELS
// (Dashboard Stripe → Paramètres → Comptes bancaires et devises), pour
// que le solde plateforme ne soit plus balayé automatiquement en
// entier vers le compte bancaire perso — ce qui emportait avec lui la
// part réservée aux loueurs (solde_transit), avant même qu'ils n'aient
// demandé leur retrait. À la place, ce cron déclenche maintenant
// lui-même un virement Stripe manuel, mais UNIQUEMENT du montant de la
// commission plateforme (jamais la part du loueur) — un seul virement
// groupé à la fin du run, pour toutes les commissions traitées ce
// jour-là. La part du loueur (solde_transit) reste intacte sur le
// solde Stripe, disponible pour connect-transfer.js le jour où il en
// demande le retrait.
//
// ⚠️ Même piège que sur les autres crons : la clé secrète Supabase
// (sb_secret_...) doit être envoyée UNIQUEMENT dans l'en-tête `apikey`,
// jamais dans `Authorization: Bearer`.
// ═══════════════════════════════════════════════════════════════════

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = 'https://mdrappwsebplprznqslm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKEND_EMAIL_URL = 'https://bc-backend-v2.vercel.app/api/send-email';

function supabaseHeaders(extra = {}) {
  return { apikey: SUPABASE_SERVICE_ROLE_KEY, ...extra };
}

export default async function handler(req, res) {
  // Sécurité : même garde que cron-avis.js
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
  }

  // Date d'hier, en heure de Paris, au format YYYY-MM-DD
  const hierParis = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' })
    .format(new Date(Date.now() - 24 * 60 * 60 * 1000));

  try {
    // 1. Concours dont la date de fin RÉELLE est hier
    const respConcours = await fetch(
      `${SUPABASE_URL}/rest/v1/concours?date_fin=eq.${hierParis}&select=id`,
      { headers: supabaseHeaders() }
    );
    const concoursTermines = await respConcours.json();
    if (!Array.isArray(concoursTermines)) {
      return res.status(500).json({ error: 'Erreur lecture concours', detail: concoursTermines });
    }

    if (concoursTermines.length === 0) {
      return res.status(200).json({
        ok: true,
        date: hierParis,
        reservationsTraitees: 0,
        totalCredite: 0,
        erreurs: [],
        info: 'Aucun concours ne se terminait hier.',
      });
    }

    const concoursIds = concoursTermines.map(c => c.id).join(',');

    // 2. Réservations payées, liées à ces concours, pas encore créditées —
    // peu importe le nombre de jours réservés individuellement par chaque
    // cavalier, seule la fin réelle du concours compte désormais.
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/reservations?concours_id=in.(${concoursIds})&statut=eq.payee&or=(virement_effectue.is.null,virement_effectue.eq.false)`,
      { headers: supabaseHeaders() }
    );
    const reservations = await resp.json();
    if (!Array.isArray(reservations)) {
      return res.status(500).json({ error: 'Erreur lecture réservations', detail: reservations });
    }

    let traitees = 0;
    let totalCredite = 0;
    let totalCommission = 0;
    const erreurs = [];

    for (const r of reservations) {
      try {
        // Même calcul que marquerVirementEffectue() côté admin — NE PAS modifier
        // sans modifier aussi le frontend, pour garder les deux cohérents.
        const montantSousLoueur = Math.round((r.montant || 0) * 21 / 24);

        // 3. Solde actuel du sous-loueur
        const respU = await fetch(
          `${SUPABASE_URL}/rest/v1/users?id=eq.${r.sous_loueur_id}&select=solde_transit,email`,
          { headers: supabaseHeaders() }
        );
        const usersData = await respU.json();
        const u = Array.isArray(usersData) ? usersData[0] : null;
        if (!u) {
          erreurs.push({ reservationId: r.id, erreur: 'sous-loueur introuvable' });
          continue;
        }
        const nouveauSolde = (u.solde_transit || 0) + montantSousLoueur;

        // 4. Créditer le solde transit
        const majSolde = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${r.sous_loueur_id}`, {
          method: 'PATCH',
          headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ solde_transit: nouveauSolde }),
        });
        if (!majSolde.ok) {
          erreurs.push({ reservationId: r.id, erreur: 'échec mise à jour solde_transit' });
          continue;
        }

        // 5. Marquer la réservation comme virement effectué (même colonnes que le flux manuel)
        const majResa = await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${r.id}`, {
          method: 'PATCH',
          headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ virement_effectue: true, virement_traite_le: new Date().toISOString() }),
        });
        if (!majResa.ok) {
          erreurs.push({ reservationId: r.id, erreur: 'échec mise à jour virement_effectue' });
          continue;
        }

        // 5bis. Générer la facture correspondant à la commission prélevée
        // Non bloquant à dessein : un souci de facturation ne doit jamais
        // empêcher le virement réel ni la notification à l'adhérent.
        const commission = (r.montant || 0) - montantSousLoueur;
        try {
          const numeroResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/generate_facture_numero`, {
            method: 'POST',
            headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({}),
          });
          const numero = await numeroResp.json();

          await fetch(`${SUPABASE_URL}/rest/v1/factures`, {
            method: 'POST',
            headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
            body: JSON.stringify({
              numero,
              user_id: r.sous_loueur_id,
              nom_client: r.sous_loueur_nom || u.email,
              concours_nom: r.concours_nom || '',
              concours_lieu: r.concours_lieu || '',
              date_debut: r.date_debut || null,
              date_fin: r.date_fin || null,
              montant: commission,
              reservation_id: r.id,
              transfer_ref: null,
            }),
          });
        } catch (eFacture) {
          console.error('Erreur génération facture réservation', r.id, eFacture);
          erreurs.push({ reservationId: r.id, erreur: 'échec génération facture (non bloquant)' });
        }

        // 6. Notification in-app (même texte que le flux manuel)
        await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
          method: 'POST',
          headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            user_id: r.sous_loueur_id,
            type: 'virement_effectue',
            titre: 'Virement effectué 💸',
            message: montantSousLoueur + '€ ont été crédités sur votre compte transit.',
            lien: 'profil:coordonnees',
          }),
        });

        // 7. Email (même type que le flux manuel : "virement_recu")
        if (u.email) {
          await fetch(BACKEND_EMAIL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'virement_recu',
              to: u.email,
              nom: r.sous_loueur_nom || u.email,
              details: {
                concours: r.concours_nom || '',
                dates: r.jours || '',
                cavalier: r.cavalier_nom || r.cavalier_email || '',
                prix: montantSousLoueur + '€',
              },
            }),
          });
        }

        traitees++;
        totalCredite += montantSousLoueur;
        totalCommission += commission;
      } catch (eLigne) {
        console.error('Erreur traitement réservation', r.id, eLigne);
        erreurs.push({ reservationId: r.id, erreur: eLigne.message });
      }
    }

    // 8. Virement de la commission plateforme vers le compte bancaire perso —
    // UNIQUEMENT la part de la plateforme (jamais celle des loueurs, qui
    // reste sur le solde Stripe pour connect-transfer.js). Non bloquant :
    // si ce virement échoue, tout ce qui précède (crédits, factures,
    // notifications, emails) reste acquis — la commission attendra
    // simplement le prochain passage du cron pour repartir.
    let payoutCommission = null;
    if (totalCommission > 0) {
      try {
        const payout = await stripe.payouts.create({
          amount: Math.round(totalCommission * 100),
          currency: 'eur',
          description: `Commission Box'Concours - ${hierParis}`,
        });
        payoutCommission = { id: payout.id, montant: totalCommission };
      } catch (ePayout) {
        console.error('Erreur virement commission plateforme:', ePayout);
        erreurs.push({ erreur: 'échec virement commission plateforme (non bloquant) : ' + ePayout.message });
      }
    }

    return res.status(200).json({
      ok: true,
      date: hierParis,
      concoursTermines: concoursTermines.length,
      reservationsTraitees: traitees,
      totalCredite,
      totalCommission,
      payoutCommission,
      erreurs,
    });
  } catch (e) {
    console.error('Erreur cron-solde:', e);
    return res.status(500).json({ error: e.message });
  }
}

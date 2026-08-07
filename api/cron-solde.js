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
// Objectif : automatiser ce qui se fait aujourd'hui à la main dans
// l'onglet admin "Virements", sans rien changer au calcul.
//
// ⚠️ Même piège que sur les autres crons : la clé secrète Supabase
// (sb_secret_...) doit être envoyée UNIQUEMENT dans l'en-tête `apikey`,
// jamais dans `Authorization: Bearer`.
// ═══════════════════════════════════════════════════════════════════

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
    // 1. Réservations dont le dernier jour loué est hier, payées, pas encore créditées
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/reservations?dernier_jour=eq.${hierParis}&statut=eq.payee&or=(virement_effectue.is.null,virement_effectue.eq.false)`,
      { headers: supabaseHeaders() }
    );
    const reservations = await resp.json();
    if (!Array.isArray(reservations)) {
      return res.status(500).json({ error: 'Erreur lecture réservations', detail: reservations });
    }

    let traitees = 0;
    let totalCredite = 0;
    const erreurs = [];

    for (const r of reservations) {
      try {
        // Même calcul que marquerVirementEffectue() côté admin — NE PAS modifier
        // sans modifier aussi le frontend, pour garder les deux cohérents.
        const montantSousLoueur = Math.round((r.montant || 0) * 21 / 24);

        // 2. Solde actuel du sous-loueur
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

        // 3. Créditer le solde transit
        const majSolde = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${r.sous_loueur_id}`, {
          method: 'PATCH',
          headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ solde_transit: nouveauSolde }),
        });
        if (!majSolde.ok) {
          erreurs.push({ reservationId: r.id, erreur: 'échec mise à jour solde_transit' });
          continue;
        }

        // 4. Marquer la réservation comme virement effectué (même colonnes que le flux manuel)
        const majResa = await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${r.id}`, {
          method: 'PATCH',
          headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ virement_effectue: true, virement_traite_le: new Date().toISOString() }),
        });
        if (!majResa.ok) {
          erreurs.push({ reservationId: r.id, erreur: 'échec mise à jour virement_effectue' });
          continue;
        }

        // 5. Notification in-app (même texte que le flux manuel)
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

        // 6. Email (même type que le flux manuel : "virement_recu")
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
      } catch (eLigne) {
        console.error('Erreur traitement réservation', r.id, eLigne);
        erreurs.push({ reservationId: r.id, erreur: eLigne.message });
      }
    }

    return res.status(200).json({
      ok: true,
      date: hierParis,
      reservationsTraitees: traitees,
      totalCredite,
      erreurs,
    });
  } catch (e) {
    console.error('Erreur cron-solde:', e);
    return res.status(500).json({ error: e.message });
  }
}

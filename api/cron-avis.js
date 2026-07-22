// ═══════════════════════════════════════════════════════════════════
// api/cron-avis.js
// À ajouter dans ton repo bc-backend-v2 (à côté de api/admin-action.js
// et api/send-email.js), puis déployé sur Vercel.
// Prévu pour le plan Vercel Hobby (gratuit) : une seule exécution
// programmée par jour, à ~8h heure de Paris (voir vercel-cron-config.json).
//
// ⚠️ Supabase a changé de format de clé : la nouvelle clé secrète
// (sb_secret_...) N'EST PLUS un JWT. Elle doit être envoyée UNIQUEMENT
// dans l'en-tête `apikey` — envoyée aussi dans `Authorization: Bearer`
// (comme avec l'ancienne clé service_role au format JWT), Supabase
// REJETTE la requête silencieusement. C'était la cause du bug où le
// cron ne renvoyait jamais d'erreur mais ne trouvait/traitait jamais
// aucune réservation.
// ═══════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://mdrappwsebplprznqslm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKEND_EMAIL_URL = 'https://bc-backend-v2.vercel.app/api/send-email';

function supabaseHeaders(extra = {}) {
  return { apikey: SUPABASE_SERVICE_ROLE_KEY, ...extra };
}

export default async function handler(req, res) {
  // Sécurité : Vercel Cron envoie automatiquement ce header s'il y a une
  // variable d'env CRON_SECRET configurée sur le projet.
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
  }

  // Date d'hier, en heure de Paris, au format YYYY-MM-DD
  const hierParis = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' })
    .format(new Date(Date.now() - 24 * 60 * 60 * 1000)); // en-CA => format YYYY-MM-DD

  try {
    // 1. Récupérer les réservations dont le dernier jour loué est hier,
    //    payées, et pas encore traitées pour l'avis (cavalier OU sous-loueur)
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/reservations?dernier_jour=eq.${hierParis}&statut=eq.payee&or=(avis_demande.is.null,avis_demande.eq.false,avis_demande_sousloueur.is.null,avis_demande_sousloueur.eq.false)`,
      { headers: supabaseHeaders() }
    );
    const reservations = await resp.json();
    if (!Array.isArray(reservations)) {
      return res.status(500).json({ error: 'Erreur lecture réservations', detail: reservations });
    }

    // 2. Récupérer les concours concernés (pour le nom dans le mail)
    const concoursIds = [...new Set(reservations.map(r => r.concours_id).filter(Boolean))];
    let concoursMap = {};
    if (concoursIds.length) {
      const respC = await fetch(
        `${SUPABASE_URL}/rest/v1/concours?id=in.(${concoursIds.join(',')})`,
        { headers: supabaseHeaders() }
      );
      const concoursData = await respC.json();
      if (Array.isArray(concoursData)) concoursMap = Object.fromEntries(concoursData.map(c => [c.id, c]));
    }

    let traitees = 0;

    for (const r of reservations) {
      const c = concoursMap[r.concours_id] || {};

      // ── Côté cavalier : demande de noter le sous-loueur ──
      if (!r.avis_demande) {
        await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
          method: 'POST',
          headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            user_id: r.cavalier_id, type: 'demande_avis',
            titre: "Comment s'est passée votre sous-location ? ⭐",
            message: `N'oubliez pas de laisser un avis à ${r.sous_loueur_nom||'votre sous-loueur'} pour votre box sous loué lors de ${c.nom||'ce concours'} !`,
            lien: 'profil:notation'
          })
        });
        if (r.cavalier_email) {
          await fetch(BACKEND_EMAIL_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'demande_avis', to: r.cavalier_email, nom: r.cavalier_nom || r.cavalier_email,
              details: { concours: c.nom || '', sous_loueur: r.sous_loueur_nom || '' }
            })
          });
        }
        await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${r.id}`, {
          method: 'PATCH',
          headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ avis_demande: true })
        });
      }

      // ── Côté sous-loueur : demande de noter le cavalier ──
      if (!r.avis_demande_sousloueur) {
        await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
          method: 'POST',
          headers: supabaseHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            user_id: r.sous_loueur_id, type: 'demande_avis_cavalier',
            titre: 'Comment s\'est passée cette sous-location ? ⭐',
            message: `N'oubliez pas de noter ${r.cavalier_nom||'ce cavalier'} pour ${c.nom||'ce concours'} !`,
            lien: 'profil:notation'
          })
        });
        if (r.sous_loueur_id) {
          // On récupère l'email du sous-loueur (pas stocké directement sur la réservation)
          const respU = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${r.sous_loueur_id}&select=email,nom,prenom`, {
            headers: supabaseHeaders()
          });
          const [u] = await respU.json();
          if (u && u.email) {
            await fetch(BACKEND_EMAIL_URL, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'demande_avis_cavalier', to: u.email, nom: r.sous_loueur_nom || u.email,
                details: { concours: c.nom || '', cavalier: r.cavalier_nom || '' }
              })
            });
          }
        }
        await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${r.id}`, {
          method: 'PATCH',
          headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ avis_demande_sousloueur: true })
        });
      }

      traitees++;
    }

    return res.status(200).json({ ok: true, date: hierParis, reservationsTraitees: traitees });
  } catch (e) {
    console.error('Erreur cron-avis:', e);
    return res.status(500).json({ error: e.message });
  }
}
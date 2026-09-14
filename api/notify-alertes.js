// ═══════════════════════════════════════════════════════════════════
// api/notify-alertes.js
// À ajouter dans le repo bc-backend-v2, à côté des autres fichiers api/.
//
// Rôle : appelé automatiquement par le site (dans submitAnnonce, juste
// après la publication réussie d'une annonce) pour prévenir par email tous
// les adhérents qui avaient cliqué sur "🔔 Me prévenir dès qu'un box est
// disponible" pour ce concours sur la page d'accueil.
//
// 🆕 Alerte récurrente : la demande n'est PAS effacée après l'envoi de
// l'email — l'adhérent est prévenu à CHAQUE nouvelle annonce publiée pour ce
// concours, jusqu'à ce qu'il clique lui-même sur "cliquer pour arrêter" sur
// le site (voir annulerAlerteAnnonce dans boxconcours.html), qu'il réserve
// un box sur ce concours (arrêt automatique, voir confirmResa), ou que Lise
// supprime le concours (nettoyage automatique, voir adminDelConcours).
//
// Passe par la clé secrète Supabase côté serveur (jamais exposée au
// navigateur), pour deux raisons : (1) il faut lire les demandes de TOUS
// les adhérents intéressés par ce concours, alors que les règles de
// sécurité normales (RLS) limitent chacun à voir uniquement les siennes ;
// (2) ça évite d'exposer les adresses email d'autres adhérents dans le
// navigateur de la personne qui vient de publier son annonce.
//
// ⚠️ Même piège que les autres endpoints Supabase de ce projet : la clé
// secrète (sb_secret_...) doit être envoyée UNIQUEMENT dans l'en-tête
// `apikey` — l'envoyer aussi dans `Authorization: Bearer` fait REJETER la
// requête silencieusement par Supabase.
// ═══════════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://mdrappwsebplprznqslm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKEND_EMAIL_URL = 'https://bc-backend-v2.vercel.app/api/send-email';
function supabaseHeaders(extra = {}) {
  return { apikey: SUPABASE_SERVICE_ROLE_KEY, ...extra };
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const { concoursId, concoursNom } = req.body || {};
  if (!concoursId) return res.status(400).json({ error: 'concoursId manquant' });
  try {
    // 1. Récupérer toutes les demandes d'alerte en attente pour ce concours
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/alertes_annonces?concours_id=eq.${concoursId}`,
      { headers: supabaseHeaders() }
    );
    const alertes = await resp.json();
    if (!Array.isArray(alertes)) {
      return res.status(500).json({ error: 'Erreur lecture alertes', detail: alertes });
    }
    // 2. Envoyer un email à chacun (non bloquant : une adresse en erreur ne
    // doit jamais empêcher les autres de recevoir leur alerte)
    let envoyes = 0;
    for (const a of alertes) {
      if (!a.email) continue;
      try {
        await fetch(BACKEND_EMAIL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'alerte_nouvelle_annonce',
            to: a.email,
            nom: a.nom || a.email,
            details: { concours: concoursNom || '' },
          }),
        });
        envoyes++;
      } catch (eEmail) {
        console.error('Erreur envoi email alerte à', a.email, eEmail);
      }
    }
    // 🆕 3. On ne supprime plus les demandes ici : l'alerte est récurrente,
    // elle reste active pour la prochaine annonce sur ce concours. Elle
    // n'est effacée que par un geste explicite (clic "arrêter" côté
    // adhérent), une réservation sur ce concours, ou la suppression du
    // concours par Lise — voir boxconcours.html.
    return res.status(200).json({ ok: true, envoyes });
  } catch (e) {
    console.error('Erreur notify-alertes:', e);
    return res.status(500).json({ error: e.message });
  }
}

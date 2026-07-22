import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: { bodyParser: false },
};

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

const SUPABASE_URL = 'https://mdrappwsebplprznqslm.supabase.co';
// ⚠️ Supabase a changé de format de clé : la nouvelle clé secrète
// (sb_secret_...) N'EST PLUS un JWT. Elle DOIT être envoyée uniquement dans
// l'en-tête `apikey` — si on l'envoie aussi dans `Authorization: Bearer`
// (comme on le faisait avec l'ancienne clé service_role au format JWT),
// Supabase REJETTE la requête silencieusement. C'est exactement ce qui
// bloquait la mise à jour du statut "payee" alors que le webhook renvoyait
// quand même 200 OK à Stripe.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseRequest(path, options = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: options.method === 'PATCH' ? 'return=representation' : 'return=representation',
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${path} error: ${resp.status} ${text}`);
  }
  return resp.status === 204 ? null : resp.json();
}

async function creerNotification(userId, type, titre, message, lien) {
  if (!userId) return;
  try {
    await supabaseRequest('notifications', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, type, titre, message, lien }),
    });
  } catch (e) {
    console.error('Erreur création notification:', e);
  }
}

async function notifierAdmin(type, titre, message, lien) {
  try {
    await supabaseRequest('notifications_admin', {
      method: 'POST',
      body: JSON.stringify({ type, titre, message, lien }),
    });
  } catch (e) {
    console.error('Erreur notification admin:', e);
  }
}

async function envoyerEmail(type, to, nom, details) {
  if (!to) return;
  try {
    await fetch('https://bc-backend-v2.vercel.app/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, to, nom, details }),
    });
  } catch (e) {
    console.error('Erreur envoi email:', e);
  }
}

async function marquerReservationPayee(reservationId) {
  if (!reservationId) return;

  // 1. Récupérer la réservation AVANT mise à jour pour connaître cavalier/sous-loueur
  const rows = await supabaseRequest(`reservations?id=eq.${reservationId}&select=*`);
  const reservation = rows && rows[0];

  if (!reservation) {
    console.error('Réservation introuvable pour marquerReservationPayee, id=', reservationId);
    return;
  }

  // 2. Marquer comme payée (return=representation : on vérifie qu'une ligne a bien été modifiée)
  const updated = await supabaseRequest(`reservations?id=eq.${reservationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ statut: 'payee' }),
  });
  if (!updated || !updated[0]) {
    console.error('Échec mise à jour statut payee pour la réservation', reservationId);
    return;
  }

  // 3. Récupérer le nom du concours et l'email du sous-loueur
  let nomConcours = '';
  try {
    const concoursRows = await supabaseRequest(`concours?id=eq.${reservation.concours_id}&select=nom`);
    nomConcours = concoursRows && concoursRows[0] ? concoursRows[0].nom : '';
  } catch (e) {}

  let emailSousLoueur = '';
  try {
    const userRows = await supabaseRequest(`users?id=eq.${reservation.sous_loueur_id}&select=email`);
    emailSousLoueur = userRows && userRows[0] ? userRows[0].email : '';
  } catch (e) {}

  const numero = String(reservation.numero).padStart(6, '0');

  // 4. Notifier le cavalier et le sous-loueur (in-app)
  await creerNotification(
    reservation.cavalier_id,
    'reservation_payee',
    'Paiement confirmé 💳',
    'Votre réservation a bien été payée. Pensez à demander votre ou vos numéros de box au sous-loueur via la messagerie. Bon concours !',
    'profil:reservations'
  );
  await creerNotification(
    reservation.sous_loueur_id,
    'box_paye',
    'Box payé 💰',
    (reservation.cavalier_nom || reservation.cavalier_email || 'Un cavalier') + ' a payé sa réservation. Le virement sera effectué selon le calendrier habituel. Pensez à lui communiquer le numéro de son box et son emplacement sur le concours via la messagerie.',
    'profil:reservations'
  );

  // 5. Notifier l'admin (in-app + email)
  await notifierAdmin(
    'nouvelle_transaction',
    'Nouvelle réservation payée 💰',
    (reservation.cavalier_nom || reservation.cavalier_email) + ' a payé ' + (reservation.montant || 0) + '€ pour "' + nomConcours + '" (résa #' + numero + ').',
    'admin:reservations'
  );
  await envoyerEmail('admin_nouvelle_transaction', 'lisebarreteau@gmail.com', 'Admin', {
    nom: reservation.cavalier_nom || reservation.cavalier_email,
    numero,
    concours: nomConcours,
    montant: (reservation.montant || 0) + '€',
  });

  // 6. Envoyer les emails (cavalier + sous-loueur)
  const reference = 'Résa #' + numero;
  await envoyerEmail('paiement_recu', reservation.cavalier_email, reservation.cavalier_nom || reservation.cavalier_email, {
    concours: nomConcours,
    dates: reservation.jours,
    prix: (reservation.montant || 0) + '€',
    reference,
  });
  await envoyerEmail('box_sous_louee', emailSousLoueur, reservation.sous_loueur_nom || emailSousLoueur, {
    concours: nomConcours,
    dates: reservation.jours,
    cavalier: reservation.cavalier_nom || reservation.cavalier_email,
    prix: (reservation.montant || 0) + '€',
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const buf = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature webhook invalide :', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const reservationId = session.metadata?.reservationId;
    try {
      await marquerReservationPayee(reservationId);
      console.log('Réservation marquée payée :', reservationId);
    } catch (e) {
      console.error('Erreur mise à jour Supabase:', e);
    }
  }

  res.status(200).json({ received: true });
}
 
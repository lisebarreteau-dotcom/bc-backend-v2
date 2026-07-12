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
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kcmFwcHdzZWJwbHByem5xc2xtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NTMxMjYsImV4cCI6MjA5ODEyOTEyNn0.Wfu6TGz1jAv-UJMO8gm5TiyVgol5eNsOL5vGwqazwTA';

async function supabaseRequest(path, options = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.method === 'PATCH' ? 'return=minimal' : 'return=representation',
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

async function marquerReservationPayee(reservationId) {
  if (!reservationId) return;

  // 1. Récupérer la réservation AVANT mise à jour pour connaître cavalier/sous-loueur
  const rows = await supabaseRequest(`reservations?id=eq.${reservationId}&select=*`);
  const reservation = rows && rows[0];

  // 2. Marquer comme payée
  await supabaseRequest(`reservations?id=eq.${reservationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ statut: 'payee' }),
  });

  if (!reservation) return;

  // 3. Notifier le cavalier et le sous-loueur
  await creerNotification(
    reservation.cavalier_id,
    'reservation_payee',
    'Paiement confirmé 💳',
    'Votre réservation a bien été payée. Bon concours !',
    'profil:reservations'
  );
  await creerNotification(
    reservation.sous_loueur_id,
    'box_paye',
    'Box payé 💰',
    (reservation.cavalier_nom || reservation.cavalier_email || 'Un cavalier') + ' a payé sa réservation. Le virement sera effectué selon le calendrier habituel.',
    'profil:reservations'
  );
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
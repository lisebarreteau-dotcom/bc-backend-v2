import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  const { annonceId, concours, sousLoueur, nbJours } = req.body;
  const montant = nbJours * 2400;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Box'Concours — ${concours}`,
            description: `Box sous-loué par ${sousLoueur} · ${nbJours} jour(s)`,
          },
          unit_amount: montant,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `https://boxconcours.fr?paiement=ok&resa=${annonceId}`,
      cancel_url: `https://boxconcours.fr?paiement=annule`,
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

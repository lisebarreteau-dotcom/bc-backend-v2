// api/send-email.js — Box'Concours by Jump-Addict

const COLORS = {
  bg: '#0f1b35',
  header: '#1a2744',
  accent: '#3b6fd4',
  accentLight: '#5b8ff9',
  white: '#ffffff',
  success: '#38a169',
  warning: '#d69e2e',
  danger: '#e53e3e',
};

const header = `<div style="background:#1a2744;padding:24px 32px;border-radius:12px 12px 0 0"><table cellpadding="0" cellspacing="0"><tr><td style="width:42px;height:42px;background:white;border-radius:8px;text-align:center;vertical-align:middle;font-size:22px">🧩</td><td style="padding-left:14px"><div style="color:white;font-size:18px;font-weight:700">Box'Concours</div><div style="color:#8ba3d4;font-size:11px;letter-spacing:1.5px;text-transform:uppercase">by Jump-Addict</div></td></tr></table></div>`;

const footer = `<div style="background:#1a2744;padding:20px 32px;border-radius:0 0 12px 12px;text-align:center"><p style="color:#8ba3d4;font-size:12px;margin:0">Box'Concours by Jump-Addict — <a href="https://boxconcours.fr" style="color:#5b8ff9;text-decoration:none">boxconcours.fr</a></p><p style="color:#8ba3d4;font-size:11px;margin:6px 0 0">Plateforme de sous-location de boxes · CSO & Dressage · Partout en France</p></div>`;

const wrap = (content) => `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;background:#0f1b35;padding:20px;border-radius:14px">${header}<div style="background:#162040;padding:32px;border-left:4px solid #3b6fd4">${content}</div>${footer}</div>`;

const h1 = (txt, color = '#ffffff') => `<h2 style="color:${color};font-size:22px;margin:0 0 16px;font-weight:700">${txt}</h2>`;
const p = (txt) => `<p style="color:#cbd5e0;font-size:15px;line-height:1.7;margin:0 0 14px">${txt}</p>`;
const card = (rows) => `<div style="background:#0f1b35;border:1px solid #2d4a7a;border-radius:10px;padding:18px;margin:18px 0">${rows}</div>`;
const row = (label, val) => `<p style="margin:0 0 8px"><span style="color:#8ba3d4;font-size:14px">${label} </span><span style="color:white;font-size:14px;font-weight:600">${val}</span></p>`;
const note = (txt, color = '#d69e2e') => `<div style="background:#1a2744;border-left:3px solid ${color};padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0"><p style="color:${color};font-size:13px;margin:0">💡 ${txt}</p></div>`;

const TEMPLATES = {
  inscription: (nom, d) => ({
    sujet: "Bienvenue sur Box'Concours ! 🧩",
    html: wrap(`${h1(`Bienvenue, ${nom} !`)}${p("Votre compte Box'Concours a bien été créé. Vous pouvez dès maintenant accéder à la plateforme.")}${card(`${row("Plateforme :", "boxconcours.fr")}${row("Disciplines :", "CSO · Dressage · Élevage")}${row("Couverture :", "Partout en France")}`)}${p("Que vous souhaitiez proposer votre box ou en trouver une, tout est disponible sur la plateforme.")}`)
  }),

  demande_attente: (nom, d) => ({
    sujet: "Votre demande de réservation est en attente ⏳",
    html: wrap(`${h1("Demande envoyée !", '#5b8ff9')}${p(`Bonjour ${nom}, votre demande a bien été transmise au sous-loueur.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Lieu :", d?.lieu || "—")}`)}${note("Le sous-loueur doit accepter ou refuser votre demande. Vous serez notifié par email dès qu'une décision est prise.")}`)
  }),

  reservation_confirmee: (nom, d) => ({
    sujet: "Votre réservation est confirmée ✅",
    html: wrap(`${h1("Réservation confirmée !", '#38a169')}${p(`Bonne nouvelle ${nom} ! Le sous-loueur a accepté votre demande.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Lieu :", d?.lieu || "—")}${row("Prix :", d?.prix || "—")}`)}${note("Pensez à demander le numéro du box que vous avez sous-loué directement au sous-loueur.", '#5b8ff9')}${p("Vous pouvez maintenant procéder au paiement ou annuler votre réservation depuis votre espace personnel.")}`)
  }),

  reservation_refusee: (nom, d) => ({
    sujet: "Votre demande de réservation n'a pas été acceptée",
    html: wrap(`${h1("Demande refusée", '#e53e3e')}${p(`Bonjour ${nom}, le sous-loueur n'a pas pu donner suite à votre demande.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}`)}${p("D'autres boxes peuvent être disponibles pour ce concours. Consultez les annonces sur la plateforme.")}`)
  }),

  paiement_recu: (nom, d) => ({
    sujet: "Votre paiement a bien été reçu 💳",
    html: wrap(`${h1("Paiement confirmé !", '#38a169')}${p(`Bonjour ${nom}, votre paiement a bien été enregistré. Votre réservation est définitivement validée.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Montant payé :", d?.prix || "—")}${row("Référence :", d?.reference || "—")}`)}${note("Pensez à demander le numéro du box que vous avez sous-loué directement au sous-loueur.", '#5b8ff9')}`)
  }),

  annulation_cavalier: (nom, d) => ({
    sujet: "Votre annulation a bien été prise en compte",
    html: wrap(`${h1("Réservation annulée")}${p(`Bonjour ${nom}, votre annulation a bien été enregistrée.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}`)}${p("D'autres boxes sont peut-être disponibles. Consultez les annonces sur la plateforme.")}`)
  }),

  nouvelle_demande: (nom, d) => ({
    sujet: "Nouvelle demande de réservation pour votre box 📬",
    html: wrap(`${h1("Nouvelle demande reçue !", '#5b8ff9')}${p(`Bonjour ${nom}, un cavalier souhaite réserver votre box.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Lieu :", d?.lieu || "—")}${row("Cavalier :", d?.cavalier || "—")}`)}${p("Connectez-vous à votre espace pour accepter ou refuser cette demande.")}${note("Vous avez 48h pour répondre. Sans réponse, la demande sera automatiquement annulée.")}`)
  }),

  box_sous_louee: (nom, d) => ({
    sujet: "Votre box a été sous-louée ✅",
    html: wrap(`${h1("Box sous-louée !", '#38a169')}${p(`Bonjour ${nom}, votre box a bien été sous-louée et le paiement est confirmé.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Cavalier :", d?.cavalier || "—")}${row("Montant :", d?.prix || "—")}`)}${note("Pensez à communiquer le numéro de votre box au cavalier. Merci !", '#38a169')}`)
  }),

  annulation_par_cavalier: (nom, d) => ({
    sujet: "Un cavalier a annulé sa réservation",
    html: wrap(`${h1("Réservation annulée par le cavalier", '#d69e2e')}${p(`Bonjour ${nom}, un cavalier a annulé sa réservation pour votre box.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Cavalier :", d?.cavalier || "—")}`)}${p("Votre box est de nouveau disponible et apparaîtra dans les annonces.")}`)
  }),

  virement_recu: (nom, d) => ({
    sujet: "Votre virement a été effectué 💶",
    html: wrap(`${h1("Virement reçu !", '#38a169')}${p(`Bonjour ${nom}, le paiement pour la sous-location de votre box a bien été traité.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Cavalier :", d?.cavalier || "—")}${row("Montant reçu :", d?.prix || "—")}`)}${note("Pensez à communiquer le numéro de votre box au cavalier. Merci !", '#38a169')}`)
  }),

  reset_password: (nom, d) => ({
    sujet: "Réinitialisation de votre mot de passe 🔐",
    html: wrap(`${h1("Réinitialisation du mot de passe")}${p(`Bonjour ${nom}, vous avez demandé à réinitialiser votre mot de passe.`)}${p("Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable 1 heure.")}${note("Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe reste inchangé.", '#e53e3e')}`)
  }),
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { type, to, nom, details } = req.body;

  if (!type || !to || !nom) {
    return res.status(400).json({ error: "Champs manquants : type, to, nom requis" });
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) {
    return res.status(500).json({ error: "Clé API Brevo manquante" });
  }

  const template = TEMPLATES[type];
  if (!template) {
    return res.status(400).json({ error: `Type inconnu : ${type}`, types_valides: Object.keys(TEMPLATES) });
  }

  const { sujet, html } = template(nom, details);

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: "Box'Concours", email: "contact@boxconcours.fr" },
        to: [{ email: to, name: nom }],
        subject: sujet,
        htmlContent: html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: "Erreur Brevo", details: data });
    }

    return res.status(200).json({ success: true, type, messageId: data.messageId });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

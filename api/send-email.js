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
    html: wrap(`${h1("Demande envoyée !", '#5b8ff9')}${p(`Bonjour ${nom}, votre demande a bien été transmise au sous-loueur.`)}${card(`${d?.numero ? row("Numéro de réservation :", "#" + d.numero) : ''}${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Lieu :", d?.lieu || "—")}`)}${note("Le sous-loueur doit accepter ou refuser votre demande. Vous serez notifié par email dès qu'une décision est prise.")}`)
  }),

  reservation_confirmee: (nom, d) => ({
    sujet: "Votre réservation est confirmée ✅",
    html: wrap(`${h1("Réservation confirmée !", '#38a169')}${p(`Bonne nouvelle ${nom} ! Le sous-loueur a accepté votre demande.`)}${card(`${d?.numero ? row("Numéro de réservation :", "#" + d.numero) : ''}${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Lieu :", d?.lieu || "—")}${row("Prix :", d?.prix || "—")}`)}${note("Pensez à demander le numéro du box que vous avez sous-loué directement au sous-loueur.", '#5b8ff9')}${p("Vous pouvez maintenant procéder au paiement ou annuler votre réservation depuis votre espace personnel.")}`)
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
    html: wrap(`${h1("Nouvelle demande reçue !", '#5b8ff9')}${p(`Bonjour ${nom}, un cavalier souhaite réserver votre box.`)}${card(`${d?.numero ? row("Numéro de réservation :", "#" + d.numero) : ''}${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Lieu :", d?.lieu || "—")}${row("Cavalier :", d?.cavalier || "—")}`)}${p("Connectez-vous à votre espace pour accepter ou refuser cette demande.")}`)
  }),

  box_sous_louee: (nom, d) => ({
    sujet: "Votre box a été sous-louée ✅",
    html: wrap(`${h1("Box sous-louée !", '#38a169')}${p(`Bonjour ${nom}, votre box a bien été sous-louée et le paiement est confirmé.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Cavalier :", d?.cavalier || "—")}${row("Montant :", d?.prix || "—")}`)}${note("Pensez à demander le numéro de votre box (auprès de l'organisateur si besoin) afin de le communiquer au cavalier. Merci !", '#38a169')}`)
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

  exclusion: (nom, d) => ({
    sujet: "Votre compte Box'Concours a ete suspendu",
    html: wrap(`${h1("Compte exclu de la plateforme", '#e53e3e')}${p(`Bonjour ${nom},`)}${p("Nous vous informons que votre compte Box'Concours a ete exclu suite au non-respect de notre politique d'utilisation.")}${note("Tout manquement aux regles de la plateforme entraine la suspension ou suppression definitive du compte.", '#e53e3e')}${p("Pour toute question : contact@boxconcours.fr")}${p("L'equipe Box'Concours")}`)
  }),

  // ─── NOUVEAUX TEMPLATES ─────────────────────────────────────────

  annonce_publiee: (nom, d) => ({
    sujet: "Votre annonce est en ligne ✅",
    html: wrap(`${h1("Annonce publiée !", '#38a169')}${p(`Bonjour ${nom}, votre annonce est maintenant visible par les cavaliers.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Nombre de boxes :", d?.nb_boxes || "—")}`)}${p("Vous recevrez une notification dès qu'un cavalier fera une demande de réservation.")}`)
  }),

  remboursement: (nom, d) => ({
    sujet: "Remboursement crédité sur votre compte transit 💳",
    html: wrap(`${h1("Remboursement effectué", '#38a169')}${p(`Bonjour ${nom}, un remboursement a été crédité sur votre compte transit Box'Concours.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Motif :", d?.motif || "—")}${row("Montant crédité :", d?.montant || "—")}`)}${note("Ce montant est disponible immédiatement pour une nouvelle réservation, ou peut être retiré vers votre IBAN depuis votre espace personnel.", '#5b8ff9')}`)
  }),

  retrait_effectue: (nom, d) => ({
    sujet: "Votre retrait a été envoyé 🏦",
    html: wrap(`${h1("Retrait effectué !", '#38a169')}${p(`Bonjour ${nom}, votre demande de retrait a été traitée. Les fonds ont été envoyés vers votre compte bancaire.`)}${card(`${row("Montant :", d?.montant || "—")}${row("IBAN :", d?.iban_partiel || "—")}`)}${note("Le virement peut prendre 1 à 3 jours ouvrés pour apparaître sur votre compte.", '#5b8ff9')}`)
  }),

  epidemie_demande_annulee: (nom, d) => ({
    sujet: "Votre demande a été annulée (épidémie équine) 🚨",
    html: wrap(`${h1("Demande annulée", '#e53e3e')}${p(`Bonjour ${nom}, en raison d'une épidémie équine déclarée, Box'Concours a temporairement suspendu ses activités.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}`)}${p("Le concours et l'annonce restent disponibles : vous pourrez refaire votre demande dès la reprise du site.")}${note("Aucun paiement n'a été effectué pour cette demande, rien à rembourser.", '#5b8ff9')}`)
  }),

  epidemie_remboursement_a_venir: (nom, d) => ({
    sujet: "Réservation annulée, remboursement à venir (épidémie équine) 🚨",
    html: wrap(`${h1("Réservation annulée", '#e53e3e')}${p(`Bonjour ${nom}, en raison d'une épidémie équine déclarée, votre réservation payée a été annulée.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Montant :", d?.montant || "—")}`)}${note("Vous serez remboursé intégralement sur votre compte transit prochainement. Vous pourrez refaire votre demande et payer à nouveau dès la reprise du site.", '#5b8ff9')}`)
  }),

  reprise_epidemie: (nom, d) => ({
    sujet: "Le site est de nouveau disponible ! ✅",
    html: wrap(`${h1("Box'Concours a repris !", '#38a169')}${p(`Bonjour ${nom}, l'épidémie équine est levée.`)}${p("Box'Concours a repris toutes ses activités : réservations, publications d'annonces et messagerie sont de nouveau accessibles.")}${note("Toute l'équipe Box'Concours espère que vos chevaux se portent bien et vous remercie pour votre patience durant cette période difficile !", '#38a169')}`)
  }),

  admin_nouvel_adherent: (nom, d) => ({
    sujet: "Nouvel adhérent inscrit 👤",
    html: wrap(`${h1("Nouvel adhérent")}${p("Un nouvel adhérent vient de créer un compte sur Box'Concours.")}${card(`${row("Nom :", d?.nom || "—")}${row("Email :", d?.email || "—")}`)}`)
  }),

  admin_nouvelle_annonce: (nom, d) => ({
    sujet: "Nouvelle annonce publiée 📋",
    html: wrap(`${h1("Nouvelle annonce")}${p("Un adhérent vient de publier une nouvelle annonce.")}${card(`${row("Adhérent :", d?.nom || "—")}${row("Concours :", d?.concours || "—")}${row("Nombre de boxes :", d?.nb_boxes || "—")}`)}`)
  }),

  admin_demande_remboursement: (nom, d) => ({
    sujet: "Demande de remboursement 💳",
    html: wrap(`${h1("Demande de remboursement", '#d69e2e')}${p("Un cavalier a annulé une réservation déjà payée.")}${card(`${row("Cavalier :", d?.nom || "—")}${row("Réservation :", "#" + (d?.numero || "—"))}${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Montant à créditer :", d?.montant || "—")}`)}${note("Traitez cette demande depuis l'onglet Virement de l'admin.", '#5b8ff9')}`)
  }),

  box_reserve_paiement_attendu: (nom, d) => ({
    sujet: "Félicitations, votre box est réservé ! 🎉",
    html: wrap(`${h1("Votre box est réservé !", '#38a169')}${p(`Félicitations ${nom} ! ${d?.cavalier || 'Un cavalier'} va procéder au paiement de sa réservation.`)}${card(`${d?.numero ? row("Numéro de réservation :", "#" + d.numero) : ''}${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Cavalier :", d?.cavalier || "—")}`)}${note("Vous recevrez votre paiement sur votre compte transit dès la fin du concours. Pensez à demander le numéro de votre box afin de le communiquer au cavalier.", '#5b8ff9')}`)
  }),

  demande_remboursement_recue: (nom, d) => ({
    sujet: "Votre demande de remboursement a bien été prise en compte 💳",
    html: wrap(`${h1("Demande de remboursement reçue", '#5b8ff9')}${p(`Bonjour ${nom}, votre demande de remboursement a bien été enregistrée.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}${row("Montant à créditer :", d?.montant || "—")}`)}${note("Ce montant sera crédité sur votre compte transit une fois traité par la plateforme.", '#5b8ff9')}`)
  }),

  demande_retrait_recue: (nom, d) => ({
    sujet: "Votre demande de retrait vers votre IBAN a bien été prise en compte 🏦",
    html: wrap(`${h1("Demande de retrait reçue", '#5b8ff9')}${p(`Bonjour ${nom}, votre demande de retrait vers votre compte bancaire a bien été enregistrée.`)}${card(`${row("Montant :", d?.montant || "—")}`)}${note("Traitement sous 3 à 5 jours ouvrés.", '#5b8ff9')}`)
  }),

  paiement_annule: (nom, d) => ({
    sujet: "Votre paiement a été annulé",
    html: wrap(`${h1("Paiement annulé", '#e53e3e')}${p(`Bonjour ${nom}, votre paiement n'a pas abouti et votre réservation n'a pas été enregistrée.`)}${card(`${row("Concours :", d?.concours || "—")}${row("Dates :", d?.dates || "—")}`)}${p("Vous pouvez retenter le paiement depuis votre espace personnel, tant que le box est toujours disponible.")}`)
  }),

  admin_nouvelle_transaction: (nom, d) => ({
    sujet: "Nouvelle réservation payée 💰",
    html: wrap(`${h1("Nouvelle réservation payée")}${p("Une réservation vient d'être payée sur la plateforme.")}${card(`${row("Cavalier :", d?.nom || "—")}${row("Réservation :", "#" + (d?.numero || "—"))}${row("Concours :", d?.concours || "—")}${row("Montant :", d?.montant || "—")}`)}`)
  }),

  admin_demande_virement: (nom, d) => ({
    sujet: "Demande de virement vers IBAN 🏦",
    html: wrap(`${h1("Demande de retrait")}${p("Un adhérent a demandé un retrait de son compte transit vers son IBAN.")}${card(`${row("Adhérent :", d?.nom || "—")}${row("Montant :", d?.montant || "—")}`)}${note("Traitez cette demande depuis l'onglet Virement de l'admin.", '#5b8ff9')}`)
  }),

  suspension_epidemie_info: (nom, d) => ({
    sujet: "Box'Concours suspendu — Épidémie équine 🚨",
    html: wrap(`${h1("Site temporairement suspendu", '#e53e3e')}${p(`Bonjour ${nom}, en raison d'une épidémie équine déclarée, Box'Concours a temporairement suspendu ses activités (réservations, publications d'annonces) par mesure de précaution.`)}${note("Consignes de biosécurité à respecter : isolez tout cheval présentant des symptômes, évitez les contacts entre chevaux d'écuries différentes, désinfectez le matériel partagé (seaux, licols, brosses), lavez-vous les mains entre chaque cheval, et surveillez la température de vos chevaux quotidiennement.", '#d69e2e')}${p("Nous vous tiendrons informés dès la reprise des activités. Prenez soin de vos chevaux.")}${p("L'équipe Box'Concours")}`)
  }),

  demande_avis: (nom, d) => ({
    sujet: "Comment s'est passée votre sous-location ? ⭐",
    html: wrap(`${h1("Votre avis compte !", '#5b8ff9')}${p(`Bonjour ${nom}, votre box loué pour "${d?.concours || 'ce concours'}" est terminé.`)}${card(`${row("Sous-loueur :", d?.sous_loueur || "—")}${row("Concours :", d?.concours || "—")}`)}${p("Prenez un instant pour noter votre expérience avec ce sous-loueur — cela aide toute la communauté Box'Concours à mieux choisir. C'est totalement facultatif !")}`)
  }),

  demande_avis_cavalier: (nom, d) => ({
    sujet: "Comment s'est passée cette sous-location ? ⭐",
    html: wrap(`${h1("Votre avis compte !", '#5b8ff9')}${p(`Bonjour ${nom}, la sous-location de votre box pour "${d?.concours || 'ce concours'}" est terminée.`)}${card(`${row("Cavalier :", d?.cavalier || "—")}${row("Concours :", d?.concours || "—")}`)}${p("Prenez un instant pour noter votre expérience avec ce cavalier — cela aide toute la communauté Box'Concours à mieux choisir. C'est totalement facultatif !")}`)
  }),
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
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
 
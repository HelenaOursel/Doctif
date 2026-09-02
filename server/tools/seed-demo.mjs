#!/usr/bin/env node
/**
 * Remplit un compte avec un jeu de données de test cohérent.
 *
 *   node server/tools/seed-demo.mjs <email>
 *
 * Le jeu est conçu pour que chaque écran ait de quoi montrer : des factures sur
 * douze mois avec une anomalie, deux assurances qui se recouvrent, un
 * abonnement dormant, une hausse tarifaire, des échéances proches.
 *
 * Ce qui existe déjà est CONSERVÉ : le script charge l'état courant, y ajoute
 * ce qui manque, puis réenregistre. Un identifiant déjà pris n'est jamais
 * réutilisé. Passer par `saveState` plutôt que par des INSERT directs garantit
 * les mêmes validations et le même nettoyage que l'API.
 */

import { createHash } from 'node:crypto';
import { pool, transaction } from '../src/db.mjs';
import { loadState } from '../src/state-load.mjs';
import { saveState } from '../src/state-save.mjs';

const email = process.argv[2];
if (!email) {
  console.error('Usage : node server/tools/seed-demo.mjs <email>');
  process.exit(1);
}

/* --- Dates relatives à aujourd'hui, pour que le jeu reste pertinent -------- */
const TODAY = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const days = (n) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const months = (n) => {
  const d = new Date(TODAY);
  d.setMonth(d.getMonth() + n);
  return iso(d);
};
const period = (n) => months(n).slice(0, 7);
const YEAR = TODAY.getFullYear();

/* --- PDF minimal, pour que les aperçus et téléchargements fonctionnent ----- */
function makePdf(lines) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const body = lines
    .map((l, i) => `BT /F1 12 Tf 60 ${760 - i * 22} Td (${esc(l)}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/* --- Le jeu de données ---------------------------------------------------- */

const members = [
  {
    id: 'demo_m_conjoint', name: 'Julien Moreau', relation: 'Conjoint',
    email: 'julien.moreau@example.fr', color: '#3b6ee0',
    scopes: ['logement', 'vehicule', 'assurance', 'finances'],
    readOnly: false, invitedAt: days(-420), status: 'actif',
  },
  {
    id: 'demo_m_mere', name: 'Claire Lefèvre', relation: 'Mère',
    email: 'claire.lefevre@example.fr', color: '#0b7052',
    scopes: ['sante', 'assurance'], readOnly: true, invitedAt: days(-180), status: 'actif',
  },
  {
    id: 'demo_m_notaire', name: 'Me Bertrand', relation: 'Notaire',
    email: 'etude@example.fr', color: '#8a5a1f',
    scopes: ['logement', 'finances'], readOnly: true, invitedAt: days(-40), status: 'invite',
  },
];

const contracts = [
  {
    id: 'demo_c_hab_maif', label: 'Assurance habitation', provider: 'MAIF', category: 'assurance',
    monthlyCost: 32.4, previousMonthlyCost: 29.9, startDate: days(-880),
    renewalDate: days(24), noticePeriodDays: 60, commitmentMonths: 12, status: 'actif',
    hiddenFees: 12, sharedWith: ['demo_m_conjoint'], documentIds: ['demo_doc_maif'],
    // Même objet couvert que le contrat Matmut : c'est ce qui déclenche la
    // détection de doublon dans « Économies possibles ».
    coverageOf: 'habitation',
    clauses: [
      { id: 'demo_cl_1', title: 'Tacite reconduction', excerpt: 'Le contrat se renouvelle par tacite reconduction…', severity: 'attention', reason: 'Préavis de 2 mois à respecter' },
      { id: 'demo_cl_2', title: 'Franchise de 150 €', excerpt: 'Une franchise de 150 € reste à votre charge…', severity: 'info', reason: 'Montant standard du marché' },
    ],
  },
  {
    id: 'demo_c_hab_matmut', label: 'Assurance habitation (ancienne)', provider: 'Matmut', category: 'assurance',
    monthlyCost: 27.9, startDate: days(-1200), renewalDate: days(96),
    noticePeriodDays: 30, commitmentMonths: 12, status: 'actif', hiddenFees: 0,
    sharedWith: [], documentIds: [], coverageOf: 'habitation', clauses: [],
  },
  {
    id: 'demo_c_auto_axa', label: 'Assurance auto — Peugeot 308', provider: 'AXA', category: 'vehicule',
    monthlyCost: 61.2, previousMonthlyCost: 57.8, startDate: days(-730),
    renewalDate: days(6), noticePeriodDays: 30, commitmentMonths: 12, status: 'actif',
    hiddenFees: 45, sharedWith: ['demo_m_conjoint'], documentIds: [], coverageOf: 'Peugeot 308',
    clauses: [
      { id: 'demo_cl_3', title: 'Majoration après sinistre', excerpt: 'Tout sinistre responsable entraîne une majoration…', severity: 'risque', reason: 'Impact tarifaire non plafonné' },
    ],
  },
  {
    id: 'demo_c_internet', label: 'Fibre + forfait mobile', provider: 'Orange', category: 'internet',
    monthlyCost: 54.9, previousMonthlyCost: 44.9, startDate: days(-500),
    renewalDate: days(140), noticePeriodDays: 30, commitmentMonths: 12, status: 'actif',
    hiddenFees: 0, sharedWith: [], documentIds: ['demo_doc_orange'], clauses: [],
  },
  {
    id: 'demo_c_salle', label: 'Salle de sport', provider: 'FitPark', category: 'autre',
    monthlyCost: 39.9, startDate: days(-400), renewalDate: days(52),
    noticePeriodDays: 30, commitmentMonths: 12, status: 'actif', hiddenFees: 0,
    sharedWith: [], documentIds: [],
    // Dernier passage il y a plus de six mois : abonnement jugé dormant.
    lastUsedAt: days(-215), usagePerMonth: 0, clauses: [],
  },
  {
    id: 'demo_c_streaming', label: 'Abonnement streaming', provider: 'Netflix', category: 'autre',
    monthlyCost: 19.99, previousMonthlyCost: 15.49, startDate: days(-600),
    renewalDate: days(210), noticePeriodDays: 0, commitmentMonths: 0, status: 'actif',
    hiddenFees: 0, sharedWith: ['demo_m_conjoint'], documentIds: [],
    lastUsedAt: days(-3), usagePerMonth: 14, clauses: [],
  },
];

const documents = [
  {
    id: 'demo_doc_maif', name: `${YEAR}-attestation-maif-assurance`, originalName: 'attestation_maif.pdf',
    category: 'assurance', docType: 'attestation', source: 'pdf', issuer: 'MAIF',
    date: days(-120), addedAt: days(-118), sizeKb: 2,
    text: "ATTESTATION D ASSURANCE HABITATION\nContrat multirisque habitation numero 4455120\nGaranties : incendie, degat des eaux, vol, responsabilite civile\nFranchise : 150 euros\nCotisation mensuelle : 32,40 euros",
    tags: ['assurance', 'habitation'], sharedWith: ['demo_m_conjoint'],
    archived: false, confidence: 0.96, contractId: 'demo_c_hab_maif',
  },
  {
    id: 'demo_doc_orange', name: `${YEAR}-facture-orange-internet`, originalName: 'facture_orange.pdf',
    category: 'internet', docType: 'facture', source: 'pdf', issuer: 'Orange',
    date: days(-20), addedAt: days(-19), sizeKb: 2, amount: 54.9,
    text: "FACTURE ORANGE\nOffre Livebox Fibre + forfait mobile 5G\nPeriode facturee : mois en cours\nMontant total TTC : 54,90 euros\nDate de prelevement : le 8 du mois",
    tags: ['internet', 'fibre'], sharedWith: [], archived: false, confidence: 0.93,
    contractId: 'demo_c_internet',
  },
  {
    id: 'demo_doc_avis', name: `${YEAR}-avis-imposition-impots`, originalName: 'avis_imposition.pdf',
    category: 'impots', docType: 'avis', source: 'pdf', issuer: 'DGFiP',
    date: days(-45), addedAt: days(-44), sizeKb: 2, amount: 3612,
    text: `AVIS D IMPOSITION ${YEAR}\nDirection generale des finances publiques\nRevenu fiscal de reference : 41 250 euros\nMontant restant du : 3 612 euros\nDate limite de paiement : ${days(20)}`,
    tags: ['impots'], sharedWith: [], archived: false, confidence: 0.97,
  },
  {
    id: 'demo_doc_bail', name: `${YEAR - 3}-contrat-bail-logement`, originalName: 'bail_location.pdf',
    category: 'logement', docType: 'contrat', source: 'pdf', issuer: 'Agence Lyonnaise',
    date: days(-1120), addedAt: days(-1118), sizeKb: 2,
    text: "CONTRAT DE BAIL D HABITATION\nLogement de 74 m2, 3 pieces\nLoyer mensuel hors charges : 890 euros\nDepot de garantie : 890 euros\nEtat des lieux d entree annexe au present bail",
    tags: ['logement', 'bail'], sharedWith: ['demo_m_conjoint', 'demo_m_notaire'],
    archived: false, confidence: 0.94,
  },
  {
    id: 'demo_doc_sante', name: `${YEAR}-releve-mutuelle-sante`, originalName: 'releve_mutuelle.pdf',
    category: 'sante', docType: 'releve', source: 'pdf', issuer: 'Harmonie Mutuelle',
    date: days(-60), addedAt: days(-58), sizeKb: 2, amount: 128.4,
    text: "RELEVE DE PRESTATIONS\nMutuelle sante - complementaire\nRemboursements du trimestre : 128,40 euros\nTiers payant actif chez les professionnels partenaires",
    tags: ['sante'], sharedWith: ['demo_m_mere'], archived: false, confidence: 0.89,
  },
];

/**
 * Douze mois de factures par fournisseur.
 *
 * EDF suit une saisonnalité plausible, avec un pic volontairement anormal il y
 * a trois mois : c'est lui que la détection d'anomalies doit relever.
 */
const EDF_AMOUNTS = [78, 82, 96, 104, 118, 112, 88, 74, 69, 71, 186, 84];
const bills = [];
EDF_AMOUNTS.forEach((amount, i) => {
  const back = -(EDF_AMOUNTS.length - i);
  bills.push({
    id: `demo_b_edf_${i}`, category: 'energie', provider: 'EDF',
    period: period(back), amount, contractId: undefined,
  });
});
for (let i = 0; i < 12; i++) {
  const back = -(12 - i);
  bills.push({
    id: `demo_b_orange_${i}`, category: 'internet', provider: 'Orange',
    period: period(back), amount: i < 6 ? 44.9 : 54.9,
    contractId: 'demo_c_internet',
  });
}
for (let i = 0; i < 6; i++) {
  const back = -(6 - i);
  bills.push({
    id: `demo_b_eau_${i}`, category: 'logement', provider: 'Veolia',
    period: period(back), amount: [31, 29, 34, 30, 33, 32][i],
  });
}

const taxes = [
  { id: 'demo_tax_1', year: YEAR, kind: 'declaration', status: 'depose', dueDate: `${YEAR}-06-06`, note: 'Déclaration en ligne validée.' },
  { id: 'demo_tax_2', year: YEAR, kind: 'avis-imposition', amount: 3612, status: 'a-faire', dueDate: days(20), documentId: 'demo_doc_avis', note: 'Solde restant après prélèvement à la source.' },
  { id: 'demo_tax_3', year: YEAR, kind: 'taxe-fonciere', amount: 1284, status: 'a-faire', dueDate: days(48) },
  { id: 'demo_tax_4', year: YEAR - 1, kind: 'avis-imposition', amount: 3418, status: 'paye', dueDate: `${YEAR - 1}-09-15` },
  { id: 'demo_tax_5', year: YEAR - 1, kind: 'taxe-fonciere', amount: 1216, status: 'paye', dueDate: `${YEAR - 1}-10-15` },
  { id: 'demo_tax_6', year: YEAR, kind: 'revenus', amount: 41250, status: 'depose', note: 'Cumul des bulletins de paie.' },
];

const estate = [
  { id: 'demo_e_appart', label: 'Appartement — 74 m², Lyon 3e', kind: 'immobilier', value: 285000, institution: 'Étude Bertrand', beneficiaries: ['demo_m_conjoint'], documentIds: ['demo_doc_bail'], notes: 'Acte de propriété déposé chez le notaire.' },
  { id: 'demo_e_av', label: 'Assurance vie', kind: 'assurance-vie', value: 42800, institution: 'MAIF', beneficiaries: ['demo_m_conjoint', 'demo_m_mere'], documentIds: [], notes: 'Clause bénéficiaire à revoir.' },
  { id: 'demo_e_pel', label: 'Plan épargne logement', kind: 'compte', value: 18400, institution: 'Crédit Mutuel', beneficiaries: [], documentIds: [] },
  { id: 'demo_e_auto', label: 'Peugeot 308 (2019)', kind: 'vehicule', value: 9500, beneficiaries: ['demo_m_conjoint'], documentIds: [] },
];

const deadlines = [
  { id: 'demo_dl_ct', title: 'Contrôle technique — Peugeot 308', date: days(38), kind: 'controle-technique', category: 'vehicule', detected: false, done: false, note: 'Prendre rendez-vous deux semaines avant.' },
  { id: 'demo_dl_medecin', title: 'Renouvellement ordonnance', date: days(12), kind: 'autre', category: 'sante', detected: false, done: false },
];

const timelineExtra = [
  { id: 'demo_tl_1', date: days(-1120), title: 'Emménagement à Lyon', description: 'Signature du bail et état des lieux d’entrée.', kind: 'demenagement', category: 'logement', documentId: 'demo_doc_bail' },
  { id: 'demo_tl_2', date: days(-730), title: 'Achat de la Peugeot 308', description: 'Immatriculation et souscription de l’assurance auto.', kind: 'achat', category: 'vehicule', contractId: 'demo_c_auto_axa' },
  { id: 'demo_tl_3', date: days(-500), title: 'Passage à la fibre', description: 'Résiliation de l’ADSL et installation de la Livebox.', kind: 'contrat', category: 'internet', contractId: 'demo_c_internet' },
];

/* --- Application ---------------------------------------------------------- */

const { rows } = await pool.query('SELECT id FROM app.app_user WHERE email = $1', [email]);
if (!rows.length) {
  console.error(`Aucun compte pour « ${email} ».`);
  await pool.end();
  process.exit(1);
}
const userId = rows[0].id;

const result = await transaction(async (client) => {
  const current = await loadState(client, userId);

  // Fusion par identifiant : ce qui existe déjà l'emporte toujours.
  const merge = (existants, ajouts) => {
    const vus = new Set(existants.map((x) => x.id));
    return [...existants, ...ajouts.filter((x) => !vus.has(x.id))];
  };

  const state = {
    ...current,
    members: merge(current.members, members),
    contracts: merge(current.contracts, contracts),
    documents: merge(current.documents, documents),
    bills: merge(current.bills, bills),
    taxes: merge(current.taxes, taxes),
    estate: merge(current.estate, estate),
    deadlines: merge(current.deadlines, deadlines),
    timelineExtra: merge(current.timelineExtra, timelineExtra),
  };

  const saved = await saveState(client, userId, state);

  // Un PDF par document ajouté, pour que l'aperçu et le téléchargement aient
  // quelque chose à montrer. Les documents déjà pourvus ne sont pas touchés.
  let fichiers = 0;
  for (const d of documents) {
    const existe = await client.query(
      'SELECT 1 FROM app.document_file WHERE user_id = $1 AND document_id = $2',
      [userId, d.id],
    );
    if (existe.rowCount) continue;
    const pdf = makePdf([d.issuer.toUpperCase(), '', ...d.text.split('\n')]);
    await client.query(
      `INSERT INTO app.document_file (user_id, document_id, bytes, mime_type, file_name, size_bytes, checksum_sha256)
       VALUES ($1, $2, $3, 'application/pdf', $4, $5, $6)`,
      [userId, d.id, pdf, d.originalName, pdf.length, createHash('sha256').update(pdf).digest('hex')],
    );
    fichiers += 1;
  }

  return { ...saved, state, fichiers };
});

console.log(`Compte : ${email}`);
console.log(`  membres        ${result.state.members.length}`);
console.log(`  contrats       ${result.state.contracts.length}`);
console.log(`  documents      ${result.state.documents.length} (${result.fichiers} PDF ajoutés)`);
console.log(`  factures       ${result.state.bills.length}`);
console.log(`  fiscal         ${result.state.taxes.length}`);
console.log(`  patrimoine     ${result.state.estate.length}`);
console.log(`  échéances      ${result.state.deadlines.length} saisies + celles déduites des contrats`);
console.log(`  chronologie    ${result.state.timelineExtra.length}`);
console.log(`  version d'état ${result.version}`);
if (result.warnings.length) {
  console.log('Avertissements :');
  for (const w of result.warnings) console.log('  -', w);
}

await pool.end();

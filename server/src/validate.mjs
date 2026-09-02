/**
 * Validation de l'état reçu du client.
 *
 * Le principe : ce qui casserait l'insertion de façon irrécupérable est
 * rejeté en 400 avec un message exploitable (valeur d'énumération inconnue,
 * identifiant manquant) ; ce qui relève du cas limite inoffensif est normalisé
 * en silence (date vide, nombre hors bornes). Une sauvegarde entière ne doit
 * pas échouer pour un arrondi.
 */

const ENUMS = {
  category: ['assurance', 'energie', 'internet', 'banque', 'logement', 'impots', 'sante', 'vehicule', 'autre'],
  docSource: ['pdf', 'photo', 'email', 'scan'],
  docType: ['facture', 'contrat', 'attestation', 'avis', 'releve', 'courrier', 'justificatif', 'ordonnance', 'autre'],
  severity: ['info', 'attention', 'risque'],
  contractStatus: ['actif', 'resilie', 'expire'],
  deadlineKind: ['fin-contrat', 'anniversaire', 'controle-technique', 'renouvellement-assurance', 'impots', 'autre'],
  alertLevel: ['J-30', 'J-7', 'J-1', 'depassee'],
  shareScope: ['logement', 'vehicule', 'assurance', 'sante', 'finances'],
  memberStatus: ['actif', 'invite'],
  taxKind: ['declaration', 'avis-imposition', 'taxe-fonciere', 'taxe-habitation', 'revenus'],
  taxStatus: ['a-faire', 'en-cours', 'depose', 'paye'],
  timelineKind: ['contrat', 'resiliation', 'achat', 'demenagement', 'document', 'fiscal', 'sante', 'vehicule'],
  movingGroup: ['administratif', 'contrats', 'logistique', 'apres'],
  estateKind: ['immobilier', 'assurance-vie', 'compte', 'vehicule', 'objet', 'document'],
  chatRole: ['user', 'assistant'],
};

export class StateError extends Error {
  constructor(problems) {
    super(`État invalide : ${problems.length} problème(s).`);
    this.status = 400;
    this.problems = problems;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD = /^\d{4}-\d{2}$/;

/** Date ISO exploitable, ou `null` — PostgreSQL refuse la chaîne vide en `date`. */
export const dateOrNull = (value) => (typeof value === 'string' && ISO_DATE.test(value) ? value : null);

/** Nombre fini, ou `null`. */
export const numOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Nombre borné, valeur de repli si absent — pour les colonnes NOT NULL. */
export const clamp = (value, min, max, fallback = 0) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
};

/** Tableau de chaînes non vides, dédoublonné. */
export const strings = (value) =>
  Array.isArray(value) ? [...new Set(value.filter((v) => typeof v === 'string' && v))] : [];

export function validateState(state) {
  const problems = [];

  if (!state || typeof state !== 'object') throw new StateError(['Corps de requête vide ou non objet.']);

  const check = (collection, index, field, value, enumName, { required = true } = {}) => {
    if (value == null && !required) return;
    if (!ENUMS[enumName].includes(value)) {
      problems.push(`${collection}[${index}].${field} : « ${value} » n'est pas une valeur attendue.`);
    }
  };

  const checkId = (collection, index, value) => {
    if (typeof value !== 'string' || !value) {
      problems.push(`${collection}[${index}].id : identifiant manquant.`);
      return false;
    }
    return true;
  };

  const list = (value) => (Array.isArray(value) ? value : []);

  list(state.members).forEach((m, i) => {
    checkId('members', i, m?.id);
    check('members', i, 'status', m?.status, 'memberStatus');
    for (const scope of strings(m?.scopes)) {
      if (!ENUMS.shareScope.includes(scope)) {
        problems.push(`members[${i}].scopes : « ${scope} » n'est pas une portée connue.`);
      }
    }
  });

  list(state.contracts).forEach((c, i) => {
    checkId('contracts', i, c?.id);
    check('contracts', i, 'category', c?.category, 'category');
    check('contracts', i, 'status', c?.status, 'contractStatus');
    if (!dateOrNull(c?.startDate)) {
      problems.push(`contracts[${i}].startDate : date de début absente ou mal formée (attendu yyyy-MM-dd).`);
    }
    list(c?.clauses).forEach((cl, j) => {
      checkId(`contracts[${i}].clauses`, j, cl?.id);
      check(`contracts[${i}].clauses`, j, 'severity', cl?.severity, 'severity');
    });
  });

  list(state.documents).forEach((d, i) => {
    checkId('documents', i, d?.id);
    check('documents', i, 'category', d?.category, 'category');
    check('documents', i, 'docType', d?.docType, 'docType');
    check('documents', i, 'source', d?.source, 'docSource');
    if (!dateOrNull(d?.date)) {
      problems.push(`documents[${i}].date : date absente ou mal formée (attendu yyyy-MM-dd).`);
    }
  });

  list(state.deadlines).forEach((d, i) => {
    checkId('deadlines', i, d?.id);
    check('deadlines', i, 'kind', d?.kind, 'deadlineKind');
    check('deadlines', i, 'category', d?.category, 'category');
    if (!dateOrNull(d?.date)) {
      problems.push(`deadlines[${i}].date : date absente ou mal formée (attendu yyyy-MM-dd).`);
    }
  });

  list(state.bills).forEach((b, i) => {
    checkId('bills', i, b?.id);
    check('bills', i, 'category', b?.category, 'category');
    if (!PERIOD.test(String(b?.period))) {
      problems.push(`bills[${i}].period : « ${b?.period} » n'est pas au format yyyy-MM.`);
    }
    if (numOrNull(b?.amount) === null) problems.push(`bills[${i}].amount : montant manquant.`);
  });

  list(state.taxes).forEach((t, i) => {
    checkId('taxes', i, t?.id);
    check('taxes', i, 'kind', t?.kind, 'taxKind');
    check('taxes', i, 'status', t?.status, 'taxStatus');
    if (!Number.isInteger(t?.year) || t.year < 1990 || t.year > 2200) {
      problems.push(`taxes[${i}].year : « ${t?.year} » hors des bornes admises (1990-2200).`);
    }
  });

  list(state.estate).forEach((a, i) => {
    checkId('estate', i, a?.id);
    check('estate', i, 'kind', a?.kind, 'estateKind');
  });

  list(state.timelineExtra).forEach((e, i) => {
    checkId('timelineExtra', i, e?.id);
    check('timelineExtra', i, 'kind', e?.kind, 'timelineKind');
    check('timelineExtra', i, 'category', e?.category, 'category');
    if (!dateOrNull(e?.date)) {
      problems.push(`timelineExtra[${i}].date : date absente ou mal formée (attendu yyyy-MM-dd).`);
    }
  });

  list(state.chat).forEach((m, i) => {
    checkId('chat', i, m?.id);
    check('chat', i, 'role', m?.role, 'chatRole');
  });

  if (state.moving) {
    checkId('moving', 0, state.moving.id);
    if (!dateOrNull(state.moving.date)) {
      problems.push('moving.date : date de déménagement absente ou mal formée (attendu yyyy-MM-dd).');
    }
    list(state.moving.tasks).forEach((t, i) => {
      checkId('moving.tasks', i, t?.id);
      check('moving.tasks', i, 'group', t?.group, 'movingGroup');
    });
  }

  if (problems.length) throw new StateError(problems);
}

export { ENUMS };

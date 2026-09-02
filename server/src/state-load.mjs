import { toProfile } from './auth.mjs';

/** Version du format d'état attendue par le client (voir `load()` dans store.ts). */
export const STATE_SCHEMA_VERSION = 1;

/** `null` en base signifie « champ absent » côté modèle : les clés optionnelles
 *  doivent disparaître du JSON plutôt que de valoir `null`. */
const opt = (value) => (value === null ? undefined : value);

/** Regroupe des lignes de liaison en `Map<clé, valeur[]>`. */
function groupBy(rows, keyField, valueField) {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row[keyField]);
    if (list) list.push(row[valueField]);
    else map.set(row[keyField], [row[valueField]]);
  }
  return map;
}

/**
 * Reconstitue l'`AppState` complet d'un utilisateur.
 *
 * Les requêtes s'enchaînent sur une même connexion, dans une transaction en
 * lecture seule : l'état renvoyé est cohérent même si une autre écriture
 * survient entre-temps.
 */
export async function loadState(client, userId) {
  const q = async (sql) => (await client.query(sql, [userId])).rows;

  const [user] = await q('SELECT * FROM app.app_user WHERE id = $1');
  if (!user) return null;

  // `scopes` est un tableau d'énumération : l'OID d'un type créé par nous varie
  // d'une base à l'autre, `pg` n'a donc pas de décodeur et renverrait la chaîne
  // brute « {logement,finances} ». La conversion en text[] (OID standard) lui
  // rend un vrai tableau JavaScript.
  const memberRows = await q(
    `SELECT id, name, relation, email, color, scopes::text[] AS scopes, read_only, status, invited_at
       FROM app.family_member WHERE user_id = $1 ORDER BY invited_at`,
  );
  const contractRows = await q('SELECT * FROM app.contract WHERE user_id = $1 ORDER BY created_at DESC');
  // `document_file.bytes` n'est JAMAIS lu ici : on ne remonte que l'existence
  // du fichier et son type, pour que l'interface sache quoi proposer.
  const documentRows = await q(
    `SELECT d.*, f.document_id IS NOT NULL AS has_file, f.mime_type
       FROM app.document d
       LEFT JOIN app.document_file f ON f.user_id = d.user_id AND f.document_id = d.id
      WHERE d.user_id = $1
      ORDER BY d.added_at DESC`,
  );
  const deadlineRows = await q('SELECT * FROM app.deadline WHERE user_id = $1 ORDER BY due_date');
  const billRows = await q('SELECT * FROM app.bill WHERE user_id = $1 ORDER BY period');
  const taxRows = await q('SELECT * FROM app.tax_record WHERE user_id = $1 ORDER BY year DESC');
  const assetRows = await q('SELECT * FROM app.estate_asset WHERE user_id = $1 ORDER BY label');
  const timelineRows = await q('SELECT * FROM app.timeline_event WHERE user_id = $1 ORDER BY event_date');
  const chatRows = await q('SELECT * FROM app.chat_message WHERE user_id = $1 ORDER BY sent_at');
  const alertRows = await q('SELECT deadline_id, level FROM app.alert_read WHERE user_id = $1');
  // Sans filtre sur `active` : le modèle client conserve un projet terminé
  // (`active: false`) et le perdre effacerait l'historique du déménagement.
  const [movingRow] = await q(
    'SELECT * FROM app.moving_project WHERE user_id = $1 ORDER BY active DESC LIMIT 1',
  );

  // Les tables de liaison portent `user_id` (les clés étant composites) : elles
  // se filtrent directement, sans jointure vers leur table parente.
  const clauseRows = await q('SELECT * FROM app.clause WHERE user_id = $1 ORDER BY position');
  const contractDocRows = await q('SELECT * FROM app.contract_document WHERE user_id = $1');
  const contractShareRows = await q('SELECT * FROM app.contract_share WHERE user_id = $1');
  const docShareRows = await q('SELECT * FROM app.document_share WHERE user_id = $1');
  const beneficiaryRows = await q('SELECT * FROM app.estate_beneficiary WHERE user_id = $1');
  const assetDocRows = await q('SELECT * FROM app.estate_document WHERE user_id = $1');
  const movingTaskRows = movingRow
    ? (
        await client.query(
          'SELECT * FROM app.moving_task WHERE user_id = $1 AND project_id = $2 ORDER BY offset_days',
          [userId, movingRow.id],
        )
      ).rows
    : [];

  const clausesByContract = new Map();
  for (const row of clauseRows) {
    const list = clausesByContract.get(row.contract_id) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      excerpt: row.excerpt,
      severity: row.severity,
      reason: row.reason,
    });
    clausesByContract.set(row.contract_id, list);
  }

  const docsByContract = groupBy(contractDocRows, 'contract_id', 'document_id');
  const sharesByContract = groupBy(contractShareRows, 'contract_id', 'member_id');
  const sharesByDocument = groupBy(docShareRows, 'document_id', 'member_id');
  const beneficiariesByAsset = groupBy(beneficiaryRows, 'asset_id', 'member_id');
  const docsByAsset = groupBy(assetDocRows, 'asset_id', 'document_id');

  return {
    version: STATE_SCHEMA_VERSION,
    profile: toProfile(user),

    members: memberRows.map((m) => ({
      id: m.id,
      name: m.name,
      relation: m.relation,
      email: m.email,
      color: m.color,
      scopes: m.scopes,
      readOnly: m.read_only,
      invitedAt: m.invited_at,
      status: m.status,
    })),

    contracts: contractRows.map((c) => ({
      id: c.id,
      label: c.label,
      provider: c.provider,
      category: c.category,
      monthlyCost: c.monthly_cost,
      previousMonthlyCost: opt(c.previous_monthly_cost),
      startDate: c.start_date,
      endDate: opt(c.end_date),
      renewalDate: opt(c.renewal_date),
      noticePeriodDays: c.notice_period_days,
      commitmentMonths: c.commitment_months,
      status: c.status,
      clauses: clausesByContract.get(c.id) ?? [],
      hiddenFees: c.hidden_fees,
      sharedWith: sharesByContract.get(c.id) ?? [],
      lastUsedAt: opt(c.last_used_at),
      usagePerMonth: opt(c.usage_per_month),
      documentIds: docsByContract.get(c.id) ?? [],
      coverageOf: opt(c.coverage_of),
      cancelledAt: opt(c.cancelled_at),
    })),

    documents: documentRows.map((d) => ({
      id: d.id,
      name: d.name,
      originalName: d.original_name,
      category: d.category,
      docType: d.doc_type,
      source: d.source,
      issuer: d.issuer,
      date: d.doc_date,
      addedAt: d.added_at,
      sizeKb: d.size_kb,
      text: d.content_text,
      amount: opt(d.amount),
      tags: d.tags,
      contractId: opt(d.contract_id),
      sharedWith: sharesByDocument.get(d.id) ?? [],
      archived: d.archived,
      confidence: d.confidence,
      thumbnail: opt(d.thumbnail),
      // Renseignés par le serveur : le client les affiche mais ne les possède
      // pas. `saveState` les ignore en écriture.
      hasFile: d.has_file,
      mimeType: opt(d.mime_type),
    })),

    deadlines: deadlineRows.map((d) => ({
      id: d.id,
      title: d.title,
      date: d.due_date,
      kind: d.kind,
      category: d.category,
      contractId: opt(d.contract_id),
      documentId: opt(d.document_id),
      detected: d.detected,
      done: d.done,
      note: opt(d.note),
    })),

    bills: billRows.map((b) => ({
      id: b.id,
      category: b.category,
      provider: b.provider,
      period: b.period,
      amount: b.amount,
      contractId: opt(b.contract_id),
      documentId: opt(b.document_id),
    })),

    taxes: taxRows.map((t) => ({
      id: t.id,
      year: t.year,
      kind: t.kind,
      amount: opt(t.amount),
      status: t.status,
      dueDate: opt(t.due_date),
      documentId: opt(t.document_id),
      note: opt(t.note),
    })),

    estate: assetRows.map((a) => ({
      id: a.id,
      label: a.label,
      kind: a.kind,
      value: opt(a.value),
      institution: opt(a.institution),
      beneficiaries: beneficiariesByAsset.get(a.id) ?? [],
      documentIds: docsByAsset.get(a.id) ?? [],
      notes: opt(a.notes),
    })),

    moving: movingRow
      ? {
          id: movingRow.id,
          fromAddress: movingRow.from_address,
          toAddress: movingRow.to_address,
          date: movingRow.moving_date,
          active: movingRow.active,
          tasks: movingTaskRows.map((t) => ({
            id: t.id,
            label: t.label,
            group: t.task_group,
            offsetDays: t.offset_days,
            done: t.done,
            hint: opt(t.hint),
            contractId: opt(t.contract_id),
          })),
        }
      : null,

    timelineExtra: timelineRows.map((e) => ({
      id: e.id,
      date: e.event_date,
      title: e.title,
      description: e.description,
      kind: e.kind,
      category: e.category,
      contractId: opt(e.contract_id),
      documentId: opt(e.document_id),
    })),

    chat: chatRows.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      at: m.sent_at.toISOString(),
      suggestions: opt(m.suggestions),
      links: opt(m.links),
      checklist: opt(m.checklist),
    })),

    // Les alertes sont recalculées côté client ; leur identifiant vaut
    // `${deadlineId}:${level}` (deadline.service.ts).
    readAlertIds: alertRows.map((a) => `${a.deadline_id}:${a.level}`),
  };
}

import { insertRows } from './db.mjs';
import { cleanupOrphans } from './files.mjs';
import { clamp, dateOrNull, numOrNull, strings, validateState } from './validate.mjs';

/** Horodatage complet exploitable, ou l'instant courant. */
const tsOrNow = (value) => {
  const date = typeof value === 'string' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();
};

/**
 * Date `yyyy-MM-dd`, ou celle du jour.
 *
 * Le client produit `todayIso()` pour `addedAt` et `invitedAt`. On tolère
 * néanmoins un horodatage complet — d'anciens états locaux peuvent en
 * contenir — en n'en gardant que la partie date.
 */
const dayOrToday = (value) => {
  const day = dateOrNull(typeof value === 'string' ? value.slice(0, 10) : value);
  return day ?? new Date().toISOString().slice(0, 10);
};

const list = (value) => (Array.isArray(value) ? value : []);
const str = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

/** Écarte les doublons d'identifiant, qui violeraient la clé primaire. */
function dedupe(items, collection, warnings) {
  const seen = new Set();
  const kept = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      warnings.push(`${collection} : identifiant « ${item.id} » en double, seule la première occurrence est conservée.`);
      continue;
    }
    seen.add(item.id);
    kept.push(item);
  }
  return kept;
}

/**
 * Remplace intégralement l'état d'un utilisateur.
 *
 * Le client n'applique aucune intégrité référentielle : son état peut très bien
 * citer un contrat supprimé ou un membre qui n'existe plus. Plutôt que de faire
 * échouer toute la sauvegarde sur une clé étrangère, les références orphelines
 * sont neutralisées — mises à `null` quand la colonne est optionnelle, la ligne
 * de liaison étant simplement écartée sinon — et signalées dans `warnings`.
 */
export async function saveState(client, userId, state) {
  validateState(state);
  const warnings = [];

  /* --- Table rase ---------------------------------------------------------
     Les tables de liaison et les clauses partent en cascade. L'ordre suit les
     dépendances : les enfants d'abord. */
  for (const table of [
    'chat_message',
    'alert_read',
    'timeline_event',
    'bill',
    'tax_record',
    'deadline',
    'estate_asset',
    'moving_project',
    'document',
    'contract',
    'family_member',
  ]) {
    await client.query(`DELETE FROM app.${table} WHERE user_id = $1`, [userId]);
  }

  /* --- Profil -------------------------------------------------------------- */
  const profile = state.profile ?? {};
  await client.query(
    `UPDATE app.app_user SET first_name = $2, last_name = $3, address = $4, postal_code = $5,
            city = $6, phone = $7, birth_date = $8, read_only_mode = $9,
            state_version = state_version + 1
      WHERE id = $1`,
    [
      userId,
      str(profile.firstName),
      str(profile.lastName),
      str(profile.address),
      str(profile.postalCode),
      str(profile.city),
      str(profile.phone),
      dateOrNull(profile.birthDate),
      profile.readOnlyMode === true,
    ],
  );

  /* --- Collections --------------------------------------------------------- */
  const members = dedupe(list(state.members), 'members', warnings);
  const contracts = dedupe(list(state.contracts), 'contracts', warnings);
  const documents = dedupe(list(state.documents), 'documents', warnings);
  const deadlines = dedupe(list(state.deadlines), 'deadlines', warnings);
  const assets = dedupe(list(state.estate), 'estate', warnings);

  const memberIds = new Set(members.map((m) => m.id));
  const contractIds = new Set(contracts.map((c) => c.id));
  const documentIds = new Set(documents.map((d) => d.id));
  const deadlineIds = new Set(deadlines.map((d) => d.id));

  /** Référence optionnelle : conservée si la cible existe, `null` sinon. */
  const ref = (id, known, where) => {
    if (id == null || id === '') return null;
    if (known.has(id)) return id;
    warnings.push(`${where} : référence « ${id} » introuvable, champ vidé.`);
    return null;
  };

  await insertRows(
    client,
    'family_member',
    ['id', 'user_id', 'name', 'relation', 'email', 'color', 'scopes', 'read_only', 'status', 'invited_at'],
    members.map((m) => [
      m.id,
      userId,
      str(m.name),
      str(m.relation),
      str(m.email),
      str(m.color, '#888888'),
      strings(m.scopes),
      m.readOnly === true,
      m.status ?? 'invite',
      dayOrToday(m.invitedAt),
    ]),
  );

  await insertRows(
    client,
    'contract',
    ['id', 'user_id', 'label', 'provider', 'category', 'monthly_cost', 'previous_monthly_cost',
     'start_date', 'end_date', 'renewal_date', 'notice_period_days', 'commitment_months', 'status',
     'hidden_fees', 'last_used_at', 'usage_per_month', 'coverage_of', 'cancelled_at'],
    contracts.map((c) => [
      c.id,
      userId,
      str(c.label),
      str(c.provider),
      c.category,
      clamp(c.monthlyCost, 0, 1e10),
      numOrNull(c.previousMonthlyCost),
      dateOrNull(c.startDate),
      dateOrNull(c.endDate),
      dateOrNull(c.renewalDate),
      clamp(c.noticePeriodDays, 0, 3650),
      clamp(c.commitmentMonths, 0, 1200),
      c.status,
      clamp(c.hiddenFees, 0, 1e10),
      dateOrNull(c.lastUsedAt),
      numOrNull(c.usagePerMonth),
      c.coverageOf ?? null,
      dateOrNull(c.cancelledAt),
    ]),
  );

  await insertRows(
    client,
    'document',
    ['id', 'user_id', 'contract_id', 'name', 'original_name', 'category', 'doc_type', 'source',
     'issuer', 'doc_date', 'added_at', 'size_kb', 'content_text', 'amount', 'tags', 'archived',
     'confidence', 'thumbnail'],
    documents.map((d) => [
      d.id,
      userId,
      ref(d.contractId, contractIds, `documents[${d.id}].contractId`),
      str(d.name),
      str(d.originalName),
      d.category,
      d.docType,
      d.source,
      str(d.issuer),
      dateOrNull(d.date),
      dayOrToday(d.addedAt),
      clamp(d.sizeKb, 0, 1e9),
      str(d.text),
      numOrNull(d.amount),
      strings(d.tags),
      d.archived === true,
      clamp(d.confidence, 0, 1),
      d.thumbnail ?? null,
    ]),
  );

  await insertRows(
    client,
    'clause',
    ['user_id', 'id', 'contract_id', 'title', 'excerpt', 'severity', 'reason', 'position'],
    contracts.flatMap((c) =>
      list(c.clauses).map((cl, position) => [
        userId,
        cl.id,
        c.id,
        str(cl.title),
        str(cl.excerpt),
        cl.severity,
        str(cl.reason),
        position,
      ]),
    ),
  );

  const contractDocuments = [];
  const contractShares = [];
  for (const contract of contracts) {
    for (const documentId of strings(contract.documentIds)) {
      if (documentIds.has(documentId)) contractDocuments.push([userId, contract.id, documentId]);
      else warnings.push(`contracts[${contract.id}].documentIds : document « ${documentId} » introuvable, lien ignoré.`);
    }
    for (const memberId of strings(contract.sharedWith)) {
      if (memberIds.has(memberId)) contractShares.push([userId, contract.id, memberId]);
      else warnings.push(`contracts[${contract.id}].sharedWith : membre « ${memberId} » introuvable, partage ignoré.`);
    }
  }
  await insertRows(client, 'contract_document', ['user_id', 'contract_id', 'document_id'], contractDocuments);
  await insertRows(client, 'contract_share', ['user_id', 'contract_id', 'member_id'], contractShares);

  const documentShares = [];
  for (const document of documents) {
    for (const memberId of strings(document.sharedWith)) {
      if (memberIds.has(memberId)) documentShares.push([userId, document.id, memberId]);
      else warnings.push(`documents[${document.id}].sharedWith : membre « ${memberId} » introuvable, partage ignoré.`);
    }
  }
  await insertRows(client, 'document_share', ['user_id', 'document_id', 'member_id'], documentShares);

  await insertRows(
    client,
    'deadline',
    ['id', 'user_id', 'contract_id', 'document_id', 'title', 'due_date', 'kind', 'category',
     'detected', 'done', 'note'],
    deadlines.map((d) => [
      d.id,
      userId,
      ref(d.contractId, contractIds, `deadlines[${d.id}].contractId`),
      ref(d.documentId, documentIds, `deadlines[${d.id}].documentId`),
      str(d.title),
      dateOrNull(d.date),
      d.kind,
      d.category,
      d.detected === true,
      d.done === true,
      d.note ?? null,
    ]),
  );

  /* Identifiant d'alerte : `${deadlineId}:${level}`. On coupe au DERNIER
     deux-points, le niveau ne pouvant pas en contenir. */
  const alerts = [];
  const seenAlerts = new Set();
  for (const alertId of strings(state.readAlertIds)) {
    const cut = alertId.lastIndexOf(':');
    if (cut < 1) continue;
    const deadlineId = alertId.slice(0, cut);
    const level = alertId.slice(cut + 1);
    const key = `${deadlineId}|${level}`;
    // Une échéance disparue emporte ses alertes : rien à signaler.
    if (!deadlineIds.has(deadlineId) || seenAlerts.has(key)) continue;
    seenAlerts.add(key);
    alerts.push([userId, deadlineId, level]);
  }
  await insertRows(client, 'alert_read', ['user_id', 'deadline_id', 'level'], alerts);

  await insertRows(
    client,
    'bill',
    ['id', 'user_id', 'contract_id', 'document_id', 'category', 'provider', 'period', 'amount'],
    dedupe(list(state.bills), 'bills', warnings).map((b) => [
      b.id,
      userId,
      ref(b.contractId, contractIds, `bills[${b.id}].contractId`),
      ref(b.documentId, documentIds, `bills[${b.id}].documentId`),
      b.category,
      str(b.provider),
      b.period,
      b.amount,
    ]),
  );

  await insertRows(
    client,
    'tax_record',
    ['id', 'user_id', 'document_id', 'year', 'kind', 'amount', 'status', 'due_date', 'note'],
    dedupe(list(state.taxes), 'taxes', warnings).map((t) => [
      t.id,
      userId,
      ref(t.documentId, documentIds, `taxes[${t.id}].documentId`),
      t.year,
      t.kind,
      numOrNull(t.amount),
      t.status,
      dateOrNull(t.dueDate),
      t.note ?? null,
    ]),
  );

  await insertRows(
    client,
    'estate_asset',
    ['id', 'user_id', 'label', 'kind', 'value', 'institution', 'notes'],
    assets.map((a) => [
      a.id,
      userId,
      str(a.label),
      a.kind,
      numOrNull(a.value),
      a.institution ?? null,
      a.notes ?? null,
    ]),
  );

  const beneficiaries = [];
  const assetDocuments = [];
  for (const asset of assets) {
    for (const memberId of strings(asset.beneficiaries)) {
      if (memberIds.has(memberId)) beneficiaries.push([userId, asset.id, memberId]);
      else warnings.push(`estate[${asset.id}].beneficiaries : membre « ${memberId} » introuvable, lien ignoré.`);
    }
    for (const documentId of strings(asset.documentIds)) {
      if (documentIds.has(documentId)) assetDocuments.push([userId, asset.id, documentId]);
      else warnings.push(`estate[${asset.id}].documentIds : document « ${documentId} » introuvable, lien ignoré.`);
    }
  }
  await insertRows(client, 'estate_beneficiary', ['user_id', 'asset_id', 'member_id'], beneficiaries);
  await insertRows(client, 'estate_document', ['user_id', 'asset_id', 'document_id'], assetDocuments);

  if (state.moving?.id) {
    const moving = state.moving;
    await insertRows(
      client,
      'moving_project',
      ['id', 'user_id', 'from_address', 'to_address', 'moving_date', 'active'],
      [[moving.id, userId, str(moving.fromAddress), str(moving.toAddress), dateOrNull(moving.date), moving.active !== false]],
    );
    await insertRows(
      client,
      'moving_task',
      ['user_id', 'id', 'project_id', 'contract_id', 'label', 'task_group', 'offset_days', 'done', 'hint'],
      dedupe(list(moving.tasks), 'moving.tasks', warnings).map((t) => [
        userId,
        t.id,
        moving.id,
        ref(t.contractId, contractIds, `moving.tasks[${t.id}].contractId`),
        str(t.label),
        t.group,
        clamp(t.offsetDays, -3650, 3650),
        t.done === true,
        t.hint ?? null,
      ]),
    );
  }

  await insertRows(
    client,
    'timeline_event',
    ['id', 'user_id', 'contract_id', 'document_id', 'event_date', 'title', 'description', 'kind', 'category'],
    dedupe(list(state.timelineExtra), 'timelineExtra', warnings).map((e) => [
      e.id,
      userId,
      ref(e.contractId, contractIds, `timelineExtra[${e.id}].contractId`),
      ref(e.documentId, documentIds, `timelineExtra[${e.id}].documentId`),
      dateOrNull(e.date),
      str(e.title),
      str(e.description),
      e.kind,
      e.category,
    ]),
  );

  await insertRows(
    client,
    'chat_message',
    ['id', 'user_id', 'role', 'text', 'sent_at', 'suggestions', 'links', 'checklist'],
    dedupe(list(state.chat), 'chat', warnings).map((m) => [
      m.id,
      userId,
      m.role,
      str(m.text),
      tsOrNow(m.at),
      m.suggestions ?? null,
      m.links ?? null,
      m.checklist ?? null,
    ]),
    ['suggestions', 'links', 'checklist'],
  );

  // Les documents viennent d'être réécrits : les fichiers dont le document a
  // disparu de l'état n'ont plus de raison d'occuper la base.
  const orphans = await cleanupOrphans(client, userId);
  if (orphans) warnings.push(`${orphans} fichier(s) devenu(s) orphelin(s) supprimé(s).`);

  const { rows } = await client.query('SELECT state_version FROM app.app_user WHERE id = $1', [userId]);
  return { version: rows[0].state_version, warnings };
}

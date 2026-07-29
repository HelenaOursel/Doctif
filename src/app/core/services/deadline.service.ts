import { Injectable, computed, inject } from '@angular/core';
import { AlertItem, AlertLevel, Contract, Deadline, DeadlineKind } from '../models';
import { Store } from '../store';
import { addDays, daysUntil, todayIso, uid } from '../utils';

export interface CalendarMonth {
  /** yyyy-MM */
  key: string;
  year: number;
  monthIndex: number;
  label: string;
  /** Grille de 6×7 jours, lundi en première colonne. */
  cells: CalendarCell[];
}

export interface CalendarCell {
  date: string;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  deadlines: Deadline[];
}

/** Seuils de notification, du plus lointain au plus proche. */
const ALERT_THRESHOLDS: { level: AlertLevel; days: number }[] = [
  { level: 'J-30', days: 30 },
  { level: 'J-7', days: 7 },
  { level: 'J-1', days: 1 },
];

const MONTH_LABELS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

/**
 * Calendrier des échéances et moteur d'alertes.
 *
 * Les alertes ne sont pas persistées : elles sont recalculées à chaque lecture
 * à partir des échéances et de la date du jour. Seul l'accusé de lecture
 * (`readAlertIds`) est stocké.
 */
@Injectable({ providedIn: 'root' })
export class DeadlineService {
  private readonly store = inject(Store);

  /** Échéances non traitées, triées par date croissante. */
  readonly upcoming = computed(() =>
    this.store
      .deadlines()
      .filter((d) => !d.done)
      .sort((a, b) => a.date.localeCompare(b.date)),
  );

  readonly overdue = computed(() => this.upcoming().filter((d) => daysUntil(d.date) < 0));

  /** Les 90 prochains jours — horizon du tableau de bord. */
  readonly next90Days = computed(() =>
    this.upcoming().filter((d) => {
      const n = daysUntil(d.date);
      return n >= 0 && n <= 90;
    }),
  );

  /**
   * Alertes actives : une échéance déclenche l'alerte du seuil le plus proche
   * déjà franchi (J-1 prime sur J-7, qui prime sur J-30), plus une alerte
   * « dépassée » si la date est passée.
   */
  readonly alerts = computed<AlertItem[]>(() => {
    const read = new Set(this.store.readAlertIds());
    const items: AlertItem[] = [];

    for (const d of this.store.deadlines()) {
      if (d.done) continue;
      const left = daysUntil(d.date);
      const level = levelFor(left);
      if (!level) continue;

      const id = `${d.id}:${level}`;
      items.push({
        id,
        deadlineId: d.id,
        level,
        daysLeft: left,
        title: d.title,
        date: d.date,
        category: d.category,
        kind: d.kind,
        read: read.has(id),
      });
    }

    return items.sort((a, b) => a.daysLeft - b.daysLeft);
  });

  readonly unreadAlerts = computed(() => this.alerts().filter((a) => !a.read));
  readonly unreadCount = computed(() => this.unreadAlerts().length);

  /* --- Détection automatique --------------------------------------------- */

  /**
   * Échéances déductibles des contrats mais absentes du calendrier.
   * Proposées à l'utilisateur plutôt qu'ajoutées d'office.
   */
  readonly suggestions = computed<Deadline[]>(() => {
    const existing = this.store.deadlines();
    const out: Deadline[] = [];

    for (const c of this.store.contracts()) {
      if (c.status !== 'actif') continue;

      for (const candidate of contractDeadlines(c)) {
        const alreadyThere = existing.some(
          (d) => d.contractId === c.id && d.kind === candidate.kind && d.date === candidate.date,
        );
        if (!alreadyThere && daysUntil(candidate.date) > -30) out.push(candidate);
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  });

  acceptSuggestion(deadline: Deadline): boolean {
    return this.store.addDeadline({ ...deadline, id: uid('dl') });
  }

  acceptAllSuggestions(): number {
    const list = this.suggestions();
    for (const s of list) this.store.addDeadline({ ...s, id: uid('dl') });
    return list.length;
  }

  /* --- Actions ------------------------------------------------------------ */

  toggleDone(id: string): void {
    const current = this.store.deadlines().find((d) => d.id === id);
    if (current) this.store.updateDeadline(id, { done: !current.done });
  }

  create(input: Partial<Deadline> & { title: string; date: string }): boolean {
    return this.store.addDeadline({
      id: uid('dl'),
      kind: 'autre',
      category: 'autre',
      detected: false,
      done: false,
      ...input,
    });
  }

  markRead(alertId: string): void {
    this.store.markAlertRead(alertId);
  }

  markAllRead(): void {
    this.store.markAllAlertsRead(this.alerts().map((a) => a.id));
  }

  /* --- Vue calendrier ----------------------------------------------------- */

  /** Construit la grille mensuelle (semaine commençant le lundi). */
  buildMonth(year: number, monthIndex: number): CalendarMonth {
    const deadlines = this.store.deadlines();
    const today = todayIso();
    const first = new Date(year, monthIndex, 1);
    // getDay() : 0 = dimanche → on ramène lundi à 0.
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, monthIndex, 1 - offset);

    const cells: CalendarCell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
      cells.push({
        date: iso,
        dayOfMonth: d.getDate(),
        inMonth: d.getMonth() === monthIndex,
        isToday: iso === today,
        deadlines: deadlines.filter((x) => x.date === iso),
      });
    }

    return {
      key: `${year}-${`${monthIndex + 1}`.padStart(2, '0')}`,
      year,
      monthIndex,
      label: `${MONTH_LABELS[monthIndex]} ${year}`,
      cells,
    };
  }

  monthLabel(monthIndex: number): string {
    return MONTH_LABELS[monthIndex];
  }
}

/** Renvoie le seuil d'alerte franchi, ou `null` si l'échéance est encore lointaine. */
function levelFor(daysLeft: number): AlertLevel | null {
  if (daysLeft < 0) return 'depassee';
  for (const t of ALERT_THRESHOLDS) {
    if (daysLeft <= t.days) return t.level;
  }
  return null;
}

/** Échéances qu'un contrat implique mécaniquement. */
function contractDeadlines(c: Contract): Deadline[] {
  const out: Deadline[] = [];
  const base = {
    contractId: c.id,
    category: c.category,
    detected: true,
    done: false,
    id: '',
  };

  if (c.renewalDate) {
    const kind: DeadlineKind = c.category === 'assurance' || c.category === 'sante' || c.category === 'vehicule'
      ? 'renouvellement-assurance'
      : 'anniversaire';
    out.push({
      ...base,
      title: `${kind === 'renouvellement-assurance' ? 'Renouvellement' : 'Date anniversaire'} — ${c.label} (${c.provider})`,
      date: c.renewalDate,
      kind,
      note: c.noticePeriodDays
        ? `Préavis de ${c.noticePeriodDays} jours : dénoncer avant le ${addDays(c.renewalDate, -c.noticePeriodDays)}.`
        : undefined,
    });
  }

  if (c.endDate && c.endDate !== c.renewalDate) {
    out.push({
      ...base,
      title: `Fin d'engagement — ${c.label} (${c.provider})`,
      date: c.endDate,
      kind: 'fin-contrat',
    });
  }

  // Le préavis mérite sa propre échéance : c'est la date qui engage réellement.
  if (c.renewalDate && c.noticePeriodDays > 0) {
    const noticeDate = addDays(c.renewalDate, -c.noticePeriodDays);
    out.push({
      ...base,
      title: `Dernier jour pour résilier — ${c.label}`,
      date: noticeDate,
      kind: 'fin-contrat',
      note: `Au-delà, le contrat est reconduit jusqu'au ${addDays(c.renewalDate, 365)}.`,
    });
  }

  return out;
}

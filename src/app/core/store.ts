import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { StorageService } from './services/storage.service';
import {
  AppState,
  Bill,
  ChatMessage,
  Contract,
  Deadline,
  DocumentItem,
  EstateAsset,
  FamilyMember,
  MovingProject,
  TaxRecord,
  TimelineEvent,
  UserProfile,
} from './models';
import { buildSeedState } from './seed';

const STORAGE_KEY = 'assistant-admin.state.v1';

/**
 * Source de vérité unique de l'application.
 *
 * L'état complet vit dans un signal ; chaque mutation le remplace de façon
 * immuable et un `effect` le persiste via `StorageService` — localStorage sur
 * le web, stockage natif sur mobile. Les écrans ne lisent jamais le stockage
 * directement.
 */
@Injectable({ providedIn: 'root' })
export class Store {
  private readonly storage = inject(StorageService);
  private readonly state = signal<AppState>(load(this.storage));

  /* --- Sélecteurs --------------------------------------------------------- */
  readonly snapshot = this.state.asReadonly();
  readonly profile = computed(() => this.state().profile);
  readonly documents = computed(() => this.state().documents);
  readonly contracts = computed(() => this.state().contracts);
  readonly deadlines = computed(() => this.state().deadlines);
  readonly members = computed(() => this.state().members);
  readonly bills = computed(() => this.state().bills);
  readonly taxes = computed(() => this.state().taxes);
  readonly estate = computed(() => this.state().estate);
  readonly moving = computed(() => this.state().moving);
  readonly chat = computed(() => this.state().chat);
  readonly readAlertIds = computed(() => this.state().readAlertIds);
  readonly timelineExtra = computed(() => this.state().timelineExtra);

  /** Mode archive : lecture seule, toute mutation est refusée. */
  readonly readOnly = computed(() => this.state().profile.readOnlyMode);

  readonly activeContracts = computed(() => this.contracts().filter((c) => c.status === 'actif'));
  readonly liveDocuments = computed(() => this.documents().filter((d) => !d.archived));

  constructor() {
    effect(() => {
      // Le service absorbe les échecs d'écriture (quota, navigation privée) :
      // l'application reste utilisable pour la session en cours.
      this.storage.set(STORAGE_KEY, JSON.stringify(this.state()));
    });
  }

  /* --- Écriture ----------------------------------------------------------- */

  /**
   * Applique une mutation. Renvoie `false` si l'application est en mode
   * archive (lecture seule) — sauf pour les mutations explicitement autorisées
   * dans ce mode, comme la sortie du mode lui-même.
   */
  private update(fn: (s: AppState) => AppState, allowInReadOnly = false): boolean {
    if (this.readOnly() && !allowInReadOnly) return false;
    this.state.update(fn);
    return true;
  }

  setProfile(patch: Partial<UserProfile>): boolean {
    return this.update((s) => ({ ...s, profile: { ...s.profile, ...patch } }), true);
  }

  /* Documents */
  addDocument(doc: DocumentItem): boolean {
    return this.update((s) => ({ ...s, documents: [doc, ...s.documents] }));
  }

  updateDocument(id: string, patch: Partial<DocumentItem>): boolean {
    return this.update((s) => ({
      ...s,
      documents: s.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  }

  removeDocument(id: string): boolean {
    return this.update((s) => ({
      ...s,
      documents: s.documents.filter((d) => d.id !== id),
      contracts: s.contracts.map((c) =>
        c.documentIds.includes(id) ? { ...c, documentIds: c.documentIds.filter((x) => x !== id) } : c,
      ),
    }));
  }

  /* Contrats */
  updateContract(id: string, patch: Partial<Contract>): boolean {
    return this.update((s) => ({
      ...s,
      contracts: s.contracts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  addContract(contract: Contract): boolean {
    return this.update((s) => ({ ...s, contracts: [contract, ...s.contracts] }));
  }

  /* Échéances */
  addDeadline(deadline: Deadline): boolean {
    return this.update((s) => ({ ...s, deadlines: [...s.deadlines, deadline] }));
  }

  updateDeadline(id: string, patch: Partial<Deadline>): boolean {
    return this.update((s) => ({
      ...s,
      deadlines: s.deadlines.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  }

  removeDeadline(id: string): boolean {
    return this.update((s) => ({ ...s, deadlines: s.deadlines.filter((d) => d.id !== id) }));
  }

  /* Alertes lues */
  markAlertRead(alertId: string): boolean {
    return this.update((s) =>
      s.readAlertIds.includes(alertId) ? s : { ...s, readAlertIds: [...s.readAlertIds, alertId] },
    );
  }

  markAllAlertsRead(ids: string[]): boolean {
    return this.update((s) => ({ ...s, readAlertIds: [...new Set([...s.readAlertIds, ...ids])] }));
  }

  /* Famille */
  addMember(member: FamilyMember): boolean {
    return this.update((s) => ({ ...s, members: [...s.members, member] }));
  }

  updateMember(id: string, patch: Partial<FamilyMember>): boolean {
    return this.update((s) => ({
      ...s,
      members: s.members.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }

  removeMember(id: string): boolean {
    return this.update((s) => ({
      ...s,
      members: s.members.filter((m) => m.id !== id),
      documents: s.documents.map((d) => ({ ...d, sharedWith: d.sharedWith.filter((x) => x !== id) })),
      contracts: s.contracts.map((c) => ({ ...c, sharedWith: c.sharedWith.filter((x) => x !== id) })),
    }));
  }

  /* Factures */
  addBill(bill: Bill): boolean {
    return this.update((s) => ({ ...s, bills: [...s.bills, bill] }));
  }

  /* Fiscal */
  updateTax(id: string, patch: Partial<TaxRecord>): boolean {
    return this.update((s) => ({ ...s, taxes: s.taxes.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }

  addTax(record: TaxRecord): boolean {
    return this.update((s) => ({ ...s, taxes: [record, ...s.taxes] }));
  }

  /* Succession */
  addAsset(asset: EstateAsset): boolean {
    return this.update((s) => ({ ...s, estate: [...s.estate, asset] }));
  }

  updateAsset(id: string, patch: Partial<EstateAsset>): boolean {
    return this.update((s) => ({ ...s, estate: s.estate.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  }

  removeAsset(id: string): boolean {
    return this.update((s) => ({ ...s, estate: s.estate.filter((a) => a.id !== id) }));
  }

  /* Déménagement */
  setMoving(moving: MovingProject | null): boolean {
    return this.update((s) => ({ ...s, moving }));
  }

  /* Chat — autorisé en lecture seule : consulter n'est pas modifier ses données */
  pushChat(message: ChatMessage): boolean {
    return this.update((s) => ({ ...s, chat: [...s.chat, message] }), true);
  }

  clearChat(): boolean {
    return this.update((s) => ({ ...s, chat: [] }), true);
  }

  /* Timeline */
  addTimelineEvent(event: TimelineEvent): boolean {
    return this.update((s) => ({ ...s, timelineExtra: [...s.timelineExtra, event] }));
  }

  /* --- Maintenance -------------------------------------------------------- */

  /** Réinitialise l'application avec le jeu de démonstration. */
  reset(): void {
    this.state.set(buildSeedState());
  }

  /** Export JSON intégral — utilisé par l'archivage à vie. */
  exportJson(): string {
    return JSON.stringify(this.state(), null, 2);
  }

  importJson(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as AppState;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.documents)) return false;
      this.state.set({ ...buildSeedState(), ...parsed });
      return true;
    } catch {
      return false;
    }
  }
}

function load(storage: StorageService): AppState {
  try {
    const raw = storage.get(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.documents) && parsed.version === 1) {
        // Complète les champs éventuellement absents d'une version antérieure
        return { ...buildSeedState(), ...parsed };
      }
    }
  } catch {
    // Données corrompues : on repart du jeu de démonstration.
  }
  return buildSeedState();
}

import { Injectable, computed, inject } from '@angular/core';
import { MovingGroup, MovingProject, MovingTask } from '../models';
import { Store } from '../store';
import { addDays, daysUntil, formatDate, uid } from '../utils';

export interface MovingSection {
  group: MovingGroup;
  label: string;
  tasks: (MovingTask & { dueDate: string; daysLeft: number })[];
  done: number;
  total: number;
}

/**
 * Génère et suit la checklist de déménagement.
 *
 * La liste de base est enrichie automatiquement : chaque contrat actif produit
 * sa propre tâche (transfert ou résiliation) selon qu'il suit le foyer ou le
 * logement.
 */
@Injectable({ providedIn: 'root' })
export class MovingService {
  private readonly store = inject(Store);

  readonly project = computed(() => this.store.moving());
  readonly active = computed(() => !!this.project()?.active);

  readonly sections = computed<MovingSection[]>(() => {
    const p = this.project();
    if (!p) return [];

    const groups: MovingGroup[] = ['logistique', 'contrats', 'administratif', 'apres'];
    return groups.map((group) => {
      const tasks = p.tasks
        .filter((t) => t.group === group)
        .map((t) => {
          const dueDate = addDays(p.date, t.offsetDays);
          return { ...t, dueDate, daysLeft: daysUntil(dueDate) };
        })
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

      return {
        group,
        label: GROUP_LABELS[group],
        tasks,
        done: tasks.filter((t) => t.done).length,
        total: tasks.length,
      };
    });
  });

  readonly progress = computed(() => {
    const p = this.project();
    if (!p || !p.tasks.length) return 0;
    return Math.round((p.tasks.filter((t) => t.done).length / p.tasks.length) * 100);
  });

  /** Tâches à traiter dans les 14 prochains jours. */
  readonly urgent = computed(() =>
    this.sections()
      .flatMap((s) => s.tasks)
      .filter((t) => !t.done && t.daysLeft <= 14)
      .sort((a, b) => a.daysLeft - b.daysLeft),
  );

  /** (Re)génère le projet et sa checklist. */
  start(input: { fromAddress: string; toAddress: string; date: string }): boolean {
    const project: MovingProject = {
      id: uid('mv'),
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      date: input.date,
      active: true,
      // La date du nouveau projet est passée explicitement : au moment de cet
      // appel le store contient encore l'ancien projet, dont la date n'a plus
      // cours pour le calcul des préavis.
      tasks: [...BASE_TASKS.map((t) => ({ ...t, id: uid('mt') })), ...this.contractTasks(input.date)],
    };
    return this.store.setMoving(project);
  }

  update(patch: Partial<MovingProject>): boolean {
    const p = this.project();
    if (!p) return false;
    return this.store.setMoving({ ...p, ...patch });
  }

  toggleTask(taskId: string): boolean {
    const p = this.project();
    if (!p) return false;
    return this.store.setMoving({
      ...p,
      tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
    });
  }

  addTask(label: string, group: MovingGroup, offsetDays: number): boolean {
    const p = this.project();
    if (!p) return false;
    return this.store.setMoving({
      ...p,
      tasks: [...p.tasks, { id: uid('mt'), label, group, offsetDays, done: false }],
    });
  }

  cancel(): boolean {
    const p = this.project();
    if (!p) return false;
    return this.store.setMoving({ ...p, active: false, tasks: [] });
  }

  /**
   * Chaque contrat actif engendre une tâche : les contrats attachés au logement
   * (énergie, internet, habitation) se transfèrent ou se résilient ; les autres
   * ne demandent qu'un changement d'adresse.
   */
  private contractTasks(movingDate: string): MovingTask[] {
    return this.store.activeContracts().map((c) => {
      const attachedToHome = ['energie', 'internet', 'logement'].includes(c.category) || c.coverageOf === 'habitation';

      if (attachedToHome) {
        return {
          id: uid('mt'),
          label: `${c.label} (${c.provider}) — transférer ou résilier`,
          group: 'contrats' as MovingGroup,
          offsetDays: -21,
          done: false,
          contractId: c.id,
          hint:
            c.noticePeriodDays > 0
              ? `Préavis de ${c.noticePeriodDays} jours : s'y prendre au plus tard le ${formatDate(addDays(movingDate, -c.noticePeriodDays), 'long')}.`
              : 'Contrat sans préavis : le transfert peut se faire à la dernière minute.',
        };
      }

      return {
        id: uid('mt'),
        label: `${c.label} (${c.provider}) — signaler la nouvelle adresse`,
        group: 'administratif' as MovingGroup,
        offsetDays: 3,
        done: false,
        contractId: c.id,
      };
    });
  }
}

const GROUP_LABELS: Record<MovingGroup, string> = {
  logistique: 'Logistique',
  contrats: 'Contrats à transférer ou résilier',
  administratif: "Changements d'adresse",
  apres: 'Après le déménagement',
};

/** Socle commun, indépendant de la situation de l'utilisateur. */
const BASE_TASKS: Omit<MovingTask, 'id'>[] = [
  {
    label: 'Donner congé au bailleur par lettre recommandée',
    group: 'logistique',
    offsetDays: -90,
    done: false,
    hint: 'Préavis d’un mois en zone tendue, trois mois sinon.',
  },
  { label: 'Demander des devis de déménageurs', group: 'logistique', offsetDays: -60, done: false },
  { label: 'Réserver le monte-meuble et l’emplacement de stationnement', group: 'logistique', offsetDays: -30, done: false },
  { label: 'Poser une journée de congé pour déménagement', group: 'logistique', offsetDays: -30, done: false },
  { label: 'Trier, donner et jeter avant d’emballer', group: 'logistique', offsetDays: -21, done: false },
  { label: 'Relever les compteurs du logement quitté', group: 'logistique', offsetDays: 0, done: false },
  {
    label: 'État des lieux de sortie',
    group: 'logistique',
    offsetDays: 0,
    done: false,
    hint: 'Comparer avec l’état des lieux d’entrée archivé dans le coffre.',
  },
  {
    label: 'Souscrire une assurance habitation pour le nouveau logement',
    group: 'contrats',
    offsetDays: -14,
    done: false,
    hint: 'Obligatoire dès la remise des clés.',
  },
  { label: 'Ouvrir les compteurs au nouveau domicile', group: 'contrats', offsetDays: -7, done: false },
  {
    label: 'Faire suivre le courrier (réexpédition)',
    group: 'administratif',
    offsetDays: -14,
    done: false,
    hint: 'Service payant de La Poste, à souscrire au moins 5 jours avant.',
  },
  { label: 'Déclarer la nouvelle adresse aux impôts', group: 'administratif', offsetDays: 7, done: false },
  { label: 'Mettre à jour la carte grise', group: 'administratif', offsetDays: 15, done: false, hint: 'Obligatoire dans le mois suivant le déménagement.' },
  { label: 'Prévenir la CPAM et la mutuelle', group: 'administratif', offsetDays: 7, done: false },
  { label: 'Prévenir la CAF et l’employeur', group: 'administratif', offsetDays: 7, done: false },
  { label: 'Mettre à jour l’adresse bancaire', group: 'administratif', offsetDays: 7, done: false },
  { label: 'S’inscrire sur les listes électorales de la nouvelle commune', group: 'apres', offsetDays: 30, done: false },
  { label: 'Trouver un nouveau médecin traitant si nécessaire', group: 'apres', offsetDays: 45, done: false },
  { label: 'Récupérer le dépôt de garantie', group: 'apres', offsetDays: 60, done: false, hint: 'Le bailleur dispose d’un à deux mois selon l’état des lieux.' },
  { label: 'Vérifier l’arrêt des anciens prélèvements', group: 'apres', offsetDays: 45, done: false },
];

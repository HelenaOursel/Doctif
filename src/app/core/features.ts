/**
 * Interrupteurs de fonctionnalités.
 *
 * Une fonctionnalité désactivée ici disparaît de l'interface — navigation,
 * route et blocs des écrans concernés — mais **son code reste en place**. Le
 * jour où la condition qui l'empêchait est levée, il suffit de repasser
 * l'interrupteur à `true`.
 */
/**
 * Le type est déclaré explicitement en `boolean`, sans `as const` : sinon
 * TypeScript fige chaque valeur sur son littéral, juge les branches
 * inatteignables et refuse les alias de gabarit (`@if (flag && x(); as y)`).
 * Basculer un interrupteur ne doit jamais faire apparaître d'erreur de type.
 */
export const FEATURES: { offers: boolean } = {
  /**
   * Comparateur d'offres du marché.
   *
   * Désactivé : il n'existe aujourd'hui aucune source de données réelle pour
   * les offres concurrentes, ni de partenariat pour les fournir. Les
   * comparaisons reposeraient donc sur des tarifs inventés, présentés à
   * l'utilisateur comme des recommandations — et sur lesquels il pourrait
   * fonder une résiliation.
   *
   * Concerne : l'écran /renouvellement, la carte du tableau de bord, l'encart
   * « offres concurrentes » de la fiche contrat, et l'économie potentielle
   * affichée dans « Économies possibles ».
   *
   * Pour réactiver : `offers: true`, et brancher `OffersService` sur une
   * véritable source de tarifs à la place du catalogue de démonstration.
   */
  offers: false,
};

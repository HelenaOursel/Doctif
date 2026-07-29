import {
  AppState,
  Bill,
  Contract,
  Deadline,
  DocumentItem,
  EstateAsset,
  FamilyMember,
  MovingProject,
  TaxRecord,
} from './models';
import { addDays, addMonths, period, todayIso, uid } from './utils';

/**
 * Jeu de données de démonstration.
 * Toutes les dates sont calculées relativement à aujourd'hui pour que les
 * échéances, alertes et anomalies restent pertinentes quel que soit le moment
 * où l'application est ouverte.
 */
export function buildSeedState(): AppState {
  const today = todayIso();
  const year = Number(today.slice(0, 4));

  const members: FamilyMember[] = [
    {
      id: 'm_conjoint',
      name: 'Julien Moreau',
      relation: 'Conjoint',
      email: 'julien.moreau@example.fr',
      color: '#3b6ee0',
      scopes: ['logement', 'vehicule', 'assurance', 'finances'],
      readOnly: false,
      invitedAt: addDays(today, -420),
      status: 'actif',
    },
    {
      id: 'm_mere',
      name: 'Claire Lefèvre',
      relation: 'Mère',
      email: 'claire.lefevre@example.fr',
      color: '#0b7052',
      scopes: ['sante', 'assurance'],
      readOnly: true,
      invitedAt: addDays(today, -180),
      status: 'actif',
    },
    {
      id: 'm_fils',
      name: 'Théo Moreau',
      relation: 'Fils',
      email: 'theo.moreau@example.fr',
      color: '#a8501d',
      scopes: ['vehicule'],
      readOnly: true,
      invitedAt: addDays(today, -25),
      status: 'invite',
    },
  ];

  /* ---------------------------------------------------------------------
     Contrats
     --------------------------------------------------------------------- */
  const contracts: Contract[] = [
    {
      id: 'c_hab_maif',
      label: 'Assurance habitation',
      provider: 'MAIF',
      category: 'assurance',
      monthlyCost: 32.49,
      previousMonthlyCost: 28.5, // +14 % — scénario mis en avant sur le tableau de bord
      startDate: addDays(today, -1100),
      renewalDate: addDays(today, 96),
      noticePeriodDays: 60,
      commitmentMonths: 12,
      status: 'actif',
      hiddenFees: 24,
      sharedWith: ['m_conjoint'],
      coverageOf: 'habitation',
      documentIds: [],
      lastUsedAt: addDays(today, -40),
      clauses: [
        {
          id: uid('cl'),
          title: 'Reconduction tacite annuelle',
          excerpt:
            "Le contrat est reconduit automatiquement d'année en année, sauf dénonciation par lettre recommandée deux mois avant l'échéance principale.",
          severity: 'attention',
          reason: "Le préavis de 60 jours court avant la date anniversaire : passé ce délai vous êtes engagé une année de plus.",
        },
        {
          id: uid('cl'),
          title: 'Franchise majorée en cas de dégât des eaux',
          excerpt:
            "Une franchise spécifique de 380 € s'applique aux sinistres dégâts des eaux consécutifs à un défaut d'entretien.",
          severity: 'attention',
          reason: 'Franchise supérieure à la moyenne du marché (≈ 150 €) sur le sinistre le plus fréquent.',
        },
        {
          id: uid('cl'),
          title: 'Indexation automatique de la cotisation',
          excerpt:
            "La cotisation est révisée chaque année selon l'indice FFB, sans plafonnement contractuel.",
          severity: 'risque',
          reason: "Aucune limite d'augmentation n'est prévue : c'est l'origine de la hausse de 14 % constatée.",
        },
      ],
    },
    {
      id: 'c_hab_matmut',
      label: 'Assurance habitation (ancien logement)',
      provider: 'Matmut',
      category: 'assurance',
      monthlyCost: 19.9,
      previousMonthlyCost: 19.4,
      startDate: addDays(today, -1500),
      renewalDate: addDays(today, 210),
      noticePeriodDays: 60,
      commitmentMonths: 12,
      status: 'actif',
      hiddenFees: 12,
      sharedWith: [],
      coverageOf: 'habitation', // doublon volontaire avec c_hab_maif
      documentIds: [],
      lastUsedAt: addDays(today, -400),
      clauses: [
        {
          id: uid('cl'),
          title: 'Contrat non résilié après déménagement',
          excerpt: "Le contrat couvre le logement situé au 14 rue des Lilas, quitté lors du déménagement.",
          severity: 'risque',
          reason: "Vous payez une seconde assurance habitation pour un logement que vous n'occupez plus.",
        },
      ],
    },
    {
      id: 'c_auto_axa',
      label: 'Assurance auto — Peugeot 308',
      provider: 'AXA',
      category: 'vehicule',
      monthlyCost: 61.2,
      previousMonthlyCost: 57.8,
      startDate: addDays(today, -730),
      endDate: addDays(today, 45), // scénario « expire dans 45 jours »
      renewalDate: addDays(today, 45),
      noticePeriodDays: 30,
      commitmentMonths: 12,
      status: 'actif',
      hiddenFees: 45,
      sharedWith: ['m_conjoint', 'm_fils'],
      coverageOf: 'peugeot-308',
      documentIds: [],
      lastUsedAt: addDays(today, -12),
      clauses: [
        {
          id: uid('cl'),
          title: 'Frais de dossier en cas de résiliation',
          excerpt: "Des frais de gestion de 45 € sont retenus en cas de résiliation en cours d'année.",
          severity: 'attention',
          reason: 'Frais non systématiques chez les concurrents ; négociables lors du renouvellement.',
        },
        {
          id: uid('cl'),
          title: 'Conducteur secondaire non déclaré',
          excerpt:
            "Tout conducteur régulier non déclaré entraîne une franchise doublée en cas de sinistre.",
          severity: 'risque',
          reason: 'Théo conduit le véhicule sans figurer au contrat : la garantie serait réduite en cas d’accident.',
        },
      ],
    },
    {
      id: 'c_energie_edf',
      label: 'Électricité — Tarif Bleu',
      provider: 'EDF',
      category: 'energie',
      monthlyCost: 118.4,
      previousMonthlyCost: 96.2,
      startDate: addDays(today, -560),
      renewalDate: addDays(today, 165),
      noticePeriodDays: 0,
      commitmentMonths: 0,
      status: 'actif',
      hiddenFees: 0,
      sharedWith: ['m_conjoint'],
      coverageOf: 'electricite',
      documentIds: [],
      lastUsedAt: today,
      clauses: [
        {
          id: uid('cl'),
          title: 'Révision tarifaire semestrielle',
          excerpt: 'Les prix du kWh sont révisés au 1er février et au 1er août de chaque année.',
          severity: 'info',
          reason: 'Clause standard sur les offres au tarif réglementé.',
        },
      ],
    },
    {
      id: 'c_gaz_engie',
      label: 'Gaz naturel',
      provider: 'Engie',
      category: 'energie',
      monthlyCost: 54.0,
      previousMonthlyCost: 52.5,
      startDate: addDays(today, -300),
      renewalDate: addDays(today, 65),
      noticePeriodDays: 30,
      commitmentMonths: 12,
      status: 'actif',
      hiddenFees: 0,
      sharedWith: ['m_conjoint'],
      coverageOf: 'gaz',
      documentIds: [],
      lastUsedAt: today,
      clauses: [],
    },
    {
      id: 'c_box_orange',
      label: 'Fibre + mobile',
      provider: 'Orange',
      category: 'internet',
      monthlyCost: 49.99,
      previousMonthlyCost: 39.99,
      startDate: addDays(today, -400),
      endDate: addDays(today, 330),
      renewalDate: addDays(today, 330),
      noticePeriodDays: 30,
      commitmentMonths: 24, // engagement long → pèse dans le score de risque
      status: 'actif',
      hiddenFees: 59,
      sharedWith: ['m_conjoint'],
      coverageOf: 'internet-domicile',
      documentIds: [],
      lastUsedAt: today,
      clauses: [
        {
          id: uid('cl'),
          title: 'Engagement de 24 mois',
          excerpt:
            "En cas de résiliation avant le terme, les mensualités restantes sont dues à hauteur de 25 % au-delà du 12e mois.",
          severity: 'risque',
          reason: "Engagement long assorti d'une pénalité de sortie : mobilité fortement contrainte.",
        },
        {
          id: uid('cl'),
          title: 'Remise promotionnelle limitée à 12 mois',
          excerpt: "Le tarif de 39,99 € s'applique les 12 premiers mois, puis passe au tarif standard.",
          severity: 'attention',
          reason: 'Origine de la hausse de 25 % constatée à la fin de la période promotionnelle.',
        },
        {
          id: uid('cl'),
          title: 'Frais de résiliation',
          excerpt: 'Des frais de résiliation de 59 € sont facturés à la clôture de la ligne.',
          severity: 'attention',
          reason: 'Frais annexes non annoncés à la souscription.',
        },
      ],
    },
    {
      id: 'c_mutuelle',
      label: 'Mutuelle santé famille',
      provider: 'Harmonie Mutuelle',
      category: 'sante',
      monthlyCost: 142.3,
      previousMonthlyCost: 138.0,
      startDate: addDays(today, -900),
      renewalDate: addDays(today, 122),
      noticePeriodDays: 60,
      commitmentMonths: 12,
      status: 'actif',
      hiddenFees: 0,
      sharedWith: ['m_conjoint', 'm_mere'],
      coverageOf: 'sante-famille',
      documentIds: [],
      lastUsedAt: addDays(today, -18),
      clauses: [
        {
          id: uid('cl'),
          title: "Délai de carence sur l'optique",
          excerpt: "Les garanties optique ne s'appliquent qu'après 6 mois d'adhésion.",
          severity: 'info',
          reason: 'Clause courante, sans impact si le contrat est ancien.',
        },
      ],
    },
    {
      id: 'c_gym',
      label: 'Abonnement salle de sport',
      provider: 'FitPark',
      category: 'autre',
      monthlyCost: 34.9,
      previousMonthlyCost: 34.9,
      startDate: addDays(today, -600),
      endDate: addDays(today, 120),
      renewalDate: addDays(today, 120),
      noticePeriodDays: 30,
      commitmentMonths: 12,
      status: 'actif',
      hiddenFees: 25,
      sharedWith: [],
      coverageOf: 'sport',
      documentIds: [],
      lastUsedAt: addDays(today, -232), // dormant depuis ~7 mois
      usagePerMonth: 0,
      clauses: [
        {
          id: uid('cl'),
          title: 'Résiliation uniquement par recommandé',
          excerpt: "La résiliation n'est acceptée que par lettre recommandée avec accusé de réception.",
          severity: 'attention',
          reason: 'Formalisme contraignant destiné à décourager la résiliation.',
        },
      ],
    },
    {
      id: 'c_streaming',
      label: 'Streaming vidéo',
      provider: 'CinéFlux',
      category: 'autre',
      monthlyCost: 15.99,
      previousMonthlyCost: 13.49,
      startDate: addDays(today, -800),
      noticePeriodDays: 0,
      commitmentMonths: 0,
      status: 'actif',
      hiddenFees: 0,
      sharedWith: [],
      coverageOf: 'streaming',
      documentIds: [],
      lastUsedAt: addDays(today, -160),
      usagePerMonth: 0,
      clauses: [],
    },
    {
      id: 'c_banque',
      label: 'Compte courant + carte Visa',
      provider: 'Crédit Mutuel',
      category: 'banque',
      monthlyCost: 8.5,
      previousMonthlyCost: 6.9,
      startDate: addDays(today, -2200),
      renewalDate: addDays(today, 250),
      noticePeriodDays: 0,
      commitmentMonths: 0,
      status: 'actif',
      hiddenFees: 36,
      sharedWith: ['m_conjoint'],
      coverageOf: 'compte-courant',
      documentIds: [],
      lastUsedAt: today,
      clauses: [
        {
          id: uid('cl'),
          title: 'Commissions d’intervention',
          excerpt: "Chaque opération présentée au-delà du découvert autorisé est facturée 8 € (plafond mensuel 80 €).",
          severity: 'attention',
          reason: 'Frais cachés potentiellement élevés en cas de découvert.',
        },
      ],
    },
    {
      id: 'c_hab_ancienne',
      label: 'Assurance habitation (résiliée)',
      provider: 'GMF',
      category: 'assurance',
      monthlyCost: 0,
      startDate: addDays(today, -2000),
      endDate: addDays(today, -700),
      noticePeriodDays: 60,
      commitmentMonths: 12,
      status: 'resilie',
      cancelledAt: addDays(today, -700),
      hiddenFees: 0,
      sharedWith: [],
      coverageOf: 'habitation-ancienne',
      documentIds: [],
      clauses: [],
    },
  ];

  /* ---------------------------------------------------------------------
     Documents (le texte alimente la recherche plein texte)
     --------------------------------------------------------------------- */
  const documents: DocumentItem[] = [
    doc({
      name: `${year}-${pad(mm(today))}-facture-edf-electricite.pdf`,
      originalName: 'FACTURE_EDF_2026.pdf',
      category: 'energie',
      docType: 'facture',
      source: 'pdf',
      issuer: 'EDF',
      date: addDays(today, -6),
      amount: 164.2,
      sizeKb: 312,
      contractId: 'c_energie_edf',
      tags: ['électricité', 'facture', 'edf'],
      sharedWith: ['m_conjoint'],
      text:
        "EDF — Facture d'électricité. Référence client 4820193746. Point de livraison 14 avenue Gambetta, 69003 Lyon. " +
        "Consommation relevée : 642 kWh sur la période. Montant total TTC : 164,20 €. Prélèvement automatique le 15 du mois. " +
        'Tarif Bleu option base, puissance souscrite 9 kVA. Prochaine relève estimée dans deux mois.',
    }),
    doc({
      name: `${year}-contrat-assurance-habitation-maif.pdf`,
      originalName: 'maif_contrat_hab_signe.pdf',
      category: 'assurance',
      docType: 'contrat',
      source: 'pdf',
      issuer: 'MAIF',
      date: addDays(today, -1100),
      amount: 389.88,
      sizeKb: 1840,
      contractId: 'c_hab_maif',
      tags: ['habitation', 'contrat', 'maif'],
      sharedWith: ['m_conjoint'],
      text:
        "MAIF — Contrat multirisque habitation n° HAB-77410932. Assuré : Hélène Moreau, 14 avenue Gambetta, 69003 Lyon. " +
        "Appartement de 74 m², 4 pièces principales, résidence principale. Cotisation annuelle 389,88 € TTC. " +
        "Échéance principale au 1er novembre. Reconduction tacite d'année en année sauf dénonciation deux mois avant l'échéance. " +
        "Franchise générale 150 €, franchise dégâts des eaux 380 €. Garanties : incendie, dégâts des eaux, vol, bris de glace, " +
        'responsabilité civile vie privée, protection juridique. Indexation annuelle selon indice FFB.',
    }),
    doc({
      name: `${year}-attestation-assurance-habitation-maif.pdf`,
      originalName: 'attestation.pdf',
      category: 'assurance',
      docType: 'attestation',
      source: 'email',
      issuer: 'MAIF',
      date: addDays(today, -60),
      sizeKb: 96,
      contractId: 'c_hab_maif',
      tags: ['attestation', 'habitation'],
      sharedWith: ['m_conjoint'],
      text:
        "MAIF — Attestation d'assurance habitation. Nous attestons que Hélène Moreau est titulaire du contrat multirisque " +
        "habitation n° HAB-77410932 couvrant le logement situé 14 avenue Gambetta, 69003 Lyon. Attestation valable jusqu'au " +
        "31 octobre. Document destiné notamment à être remis au bailleur.",
    }),
    doc({
      name: `${year}-carte-grise-peugeot-308.jpg`,
      originalName: 'IMG_20240912_154233.jpg',
      category: 'vehicule',
      docType: 'justificatif',
      source: 'photo',
      issuer: 'ANTS',
      date: addDays(today, -680),
      sizeKb: 2240,
      tags: ['carte grise', 'véhicule', 'immatriculation'],
      sharedWith: ['m_conjoint'],
      confidence: 0.93,
      text:
        "Certificat d'immatriculation — Peugeot 308 1.5 BlueHDi. Immatriculation AB-742-CD. Première mise en circulation " +
        '12/03/2019. Titulaire : Hélène Moreau. Puissance fiscale 5 CV. Énergie : gazole. Numéro de formule 2019BX41207.',
    }),
    doc({
      name: `${year}-controle-technique-peugeot-308.pdf`,
      originalName: 'PV_CT_AB742CD.pdf',
      category: 'vehicule',
      docType: 'justificatif',
      source: 'scan',
      issuer: 'Autosur',
      date: addDays(today, -685),
      amount: 89,
      sizeKb: 420,
      tags: ['contrôle technique', 'véhicule'],
      sharedWith: [],
      text:
        "Procès-verbal de contrôle technique périodique. Véhicule Peugeot 308, immatriculation AB-742-CD. " +
        "Résultat : favorable. Prochain contrôle obligatoire avant le " +
        `${frDate(addDays(today, 45))}. Kilométrage relevé : 78 420 km. ` +
        'Points contrôlés : freinage, direction, visibilité, éclairage, pollution. Aucune défaillance critique.',
    }),
    doc({
      name: `${year}-contrat-assurance-auto-axa.pdf`,
      originalName: 'AXA_auto.pdf',
      category: 'vehicule',
      docType: 'contrat',
      source: 'pdf',
      issuer: 'AXA',
      date: addDays(today, -730),
      amount: 734.4,
      sizeKb: 1120,
      contractId: 'c_auto_axa',
      tags: ['auto', 'assurance', 'axa'],
      sharedWith: ['m_conjoint', 'm_fils'],
      text:
        "AXA — Contrat d'assurance automobile n° AUTO-5518203. Véhicule assuré : Peugeot 308, immatriculation AB-742-CD. " +
        'Formule tous risques. Conducteur principal : Hélène Moreau, permis obtenu en 2008, bonus 0,55. ' +
        "Cotisation annuelle 734,40 €. Échéance annuelle : " +
        `${frDate(addDays(today, 45))}. Franchise dommages 350 €. ` +
        "Frais de gestion de 45 € en cas de résiliation en cours d'année. Tout conducteur régulier doit être déclaré.",
    }),
    doc({
      name: `${year}-avis-imposition-revenus-${year - 1}.pdf`,
      originalName: 'avis_impot.pdf',
      category: 'impots',
      docType: 'avis',
      source: 'email',
      issuer: 'DGFiP',
      date: addDays(today, -320),
      amount: 3418,
      sizeKb: 268,
      tags: ['impôts', 'avis', 'revenus'],
      sharedWith: ['m_conjoint'],
      text:
        `Direction générale des finances publiques — Avis d'impôt sur les revenus de l'année ${year - 1}. ` +
        'Numéro fiscal 1938274650192. Foyer fiscal : Hélène Moreau et Julien Moreau, 2 parts et demie. ' +
        "Revenu fiscal de référence : 58 420 €. Montant de l'impôt net : 3 418 €. " +
        'Solde à payer au 15 septembre. Prélèvement à la source déjà acquitté : 2 960 €.',
    }),
    doc({
      name: `${year}-taxe-fonciere.pdf`,
      originalName: 'taxe_fonciere_2026.pdf',
      category: 'impots',
      docType: 'avis',
      source: 'pdf',
      issuer: 'DGFiP',
      date: addDays(today, -30),
      amount: 1284,
      sizeKb: 190,
      tags: ['taxe foncière', 'impôts', 'logement'],
      sharedWith: ['m_conjoint'],
      text:
        `Avis de taxe foncière ${year} sur les propriétés bâties. Bien : appartement 74 m², 14 avenue Gambetta, 69003 Lyon. ` +
        'Valeur locative cadastrale 6 940 €. Montant total à payer : 1 284 €. Date limite de paiement : 15 octobre. ' +
        'Paiement en ligne recommandé.',
    }),
    doc({
      name: `${year}-bulletin-salaire-${pad(mm(addDays(today, -20)))}.pdf`,
      originalName: 'bulletin.pdf',
      category: 'banque',
      docType: 'justificatif',
      source: 'email',
      issuer: 'Nordica SAS',
      date: addDays(today, -20),
      amount: 3120,
      sizeKb: 148,
      tags: ['salaire', 'revenus', 'bulletin de paie'],
      sharedWith: [],
      text:
        'Bulletin de paie — Nordica SAS. Salariée : Hélène Moreau, cheffe de projet. Net à payer : 3 120,00 €. ' +
        'Net imposable : 3 402,00 €. Cumul annuel imposable : 27 216 €. Contrat à durée indéterminée depuis mars 2019. ' +
        'Prélèvement à la source : taux 8,4 %.',
    }),
    doc({
      name: `${year}-releve-compte-credit-mutuel.pdf`,
      originalName: 'releve_092026.pdf',
      category: 'banque',
      docType: 'releve',
      source: 'pdf',
      issuer: 'Crédit Mutuel',
      date: addDays(today, -12),
      sizeKb: 224,
      contractId: 'c_banque',
      tags: ['relevé', 'banque'],
      sharedWith: ['m_conjoint'],
      text:
        'Crédit Mutuel — Relevé de compte courant n° 10278 07300 00021847301. Titulaires : Hélène et Julien Moreau. ' +
        'Solde créditeur en fin de période : 4 218,53 €. Prélèvements du mois : EDF 164,20 €, Orange 49,99 €, ' +
        'MAIF 32,49 €, Matmut 19,90 €, FitPark 34,90 €, CinéFlux 15,99 €, Harmonie Mutuelle 142,30 €. ' +
        'Cotisation carte Visa Premier 8,50 €.',
    }),
    doc({
      name: `${year}-contrat-fibre-orange.pdf`,
      originalName: 'orange_contrat.pdf',
      category: 'internet',
      docType: 'contrat',
      source: 'email',
      issuer: 'Orange',
      date: addDays(today, -400),
      amount: 599.88,
      sizeKb: 640,
      contractId: 'c_box_orange',
      tags: ['fibre', 'internet', 'orange'],
      sharedWith: ['m_conjoint'],
      text:
        "Orange — Contrat Livebox Fibre + forfait mobile 5G. Référence 0478291043. Engagement de 24 mois à compter de la " +
        'souscription. Tarif promotionnel 39,99 €/mois les 12 premiers mois puis 49,99 €/mois. ' +
        'Frais de résiliation 59 €. En cas de résiliation anticipée au-delà du 12e mois, 25 % des mensualités restantes sont dues. ' +
        'Débit descendant jusqu’à 2 Gbit/s.',
    }),
    doc({
      name: `${year}-bail-location-appartement-gambetta.pdf`,
      originalName: 'bail_signe.pdf',
      category: 'logement',
      docType: 'contrat',
      source: 'scan',
      issuer: 'Agence Rhône Habitat',
      date: addDays(today, -1120),
      amount: 1080,
      sizeKb: 2960,
      tags: ['bail', 'location', 'logement'],
      sharedWith: ['m_conjoint'],
      text:
        "Contrat de location de logement nu — loi du 6 juillet 1989. Bailleur : SCI Gambetta Invest, représentée par l'agence " +
        'Rhône Habitat. Locataires : Hélène Moreau et Julien Moreau. Logement : appartement 4 pièces, 74 m², ' +
        '14 avenue Gambetta, 69003 Lyon. Loyer mensuel hors charges 1 080 €, provisions sur charges 145 €. ' +
        "Dépôt de garantie 1 080 €. Durée : 3 ans, reconduction tacite. Le locataire s'engage à fournir chaque année " +
        "une attestation d'assurance habitation.",
    }),
    doc({
      name: `${year}-etat-des-lieux-entree.pdf`,
      originalName: 'EDL.pdf',
      category: 'logement',
      docType: 'justificatif',
      source: 'scan',
      issuer: 'Agence Rhône Habitat',
      date: addDays(today, -1120),
      sizeKb: 3480,
      tags: ['état des lieux', 'logement'],
      sharedWith: ['m_conjoint'],
      text:
        "État des lieux d'entrée contradictoire. Appartement 14 avenue Gambetta, 69003 Lyon. Relevé des compteurs : " +
        'électricité 12 480 kWh, gaz 3 210 m³, eau froide 184 m³. Observations : parquet salon en bon état, ' +
        'quelques traces d’usure dans la chambre 2, volet roulant cuisine à réviser.',
    }),
    doc({
      name: `${year}-quittance-loyer-${pad(mm(addDays(today, -10)))}.pdf`,
      originalName: 'quittance.pdf',
      category: 'logement',
      docType: 'justificatif',
      source: 'email',
      issuer: 'Agence Rhône Habitat',
      date: addDays(today, -10),
      amount: 1225,
      sizeKb: 84,
      tags: ['quittance', 'loyer'],
      sharedWith: ['m_conjoint'],
      text:
        'Quittance de loyer. Période courante. Locataires : Hélène et Julien Moreau. Loyer 1 080 €, charges 145 €, ' +
        'total réglé 1 225 €. Le bailleur donne quittance du paiement intégral.',
    }),
    doc({
      name: `${year}-carte-mutuelle-harmonie.jpg`,
      originalName: 'PXL_carte_tiers_payant.jpg',
      category: 'sante',
      docType: 'attestation',
      source: 'photo',
      issuer: 'Harmonie Mutuelle',
      date: addDays(today, -200),
      sizeKb: 1180,
      contractId: 'c_mutuelle',
      tags: ['mutuelle', 'tiers payant', 'santé'],
      sharedWith: ['m_conjoint', 'm_mere'],
      confidence: 0.88,
      text:
        'Harmonie Mutuelle — Carte de tiers payant. Adhérent n° 8842019. Bénéficiaires : Hélène Moreau, Julien Moreau, ' +
        'Théo Moreau. Valable jusqu’au 31 décembre. Garanties : optique, dentaire, hospitalisation, médecine douce.',
    }),
    doc({
      name: `${year}-ordonnance-medecin-traitant.jpg`,
      originalName: 'scan_ordo.jpg',
      category: 'sante',
      docType: 'ordonnance',
      source: 'scan',
      issuer: 'Dr Nadia Berger',
      date: addDays(today, -18),
      sizeKb: 760,
      tags: ['ordonnance', 'santé'],
      sharedWith: [],
      confidence: 0.81,
      text:
        'Dr Nadia Berger, médecin généraliste, 8 rue Villeroy 69003 Lyon. Ordonnance pour Hélène Moreau. ' +
        'Renouvellement du traitement pour 3 mois. Bilan sanguin à réaliser sous 15 jours.',
    }),
    doc({
      name: `${year}-facture-orange-fibre.pdf`,
      originalName: 'facture_orange.pdf',
      category: 'internet',
      docType: 'facture',
      source: 'email',
      issuer: 'Orange',
      date: addDays(today, -8),
      amount: 49.99,
      sizeKb: 118,
      contractId: 'c_box_orange',
      tags: ['facture', 'internet'],
      sharedWith: [],
      text:
        'Orange — Facture mensuelle. Référence client 0478291043. Offre Livebox Fibre + mobile. Montant 49,99 € TTC. ' +
        'La remise promotionnelle appliquée les 12 premiers mois est arrivée à terme.',
    }),
    doc({
      name: `${year}-facture-engie-gaz.pdf`,
      originalName: 'engie.pdf',
      category: 'energie',
      docType: 'facture',
      source: 'pdf',
      issuer: 'Engie',
      date: addDays(today, -14),
      amount: 54.0,
      sizeKb: 205,
      contractId: 'c_gaz_engie',
      tags: ['gaz', 'facture'],
      sharedWith: ['m_conjoint'],
      text:
        'Engie — Facture de gaz naturel. Référence 91827364. Consommation 412 kWh PCS. Montant TTC 54,00 €. ' +
        'Échéancier mensuel, régularisation annuelle en juin.',
    }),
    doc({
      name: `${year}-contrat-assurance-habitation-matmut.pdf`,
      originalName: 'matmut.pdf',
      category: 'assurance',
      docType: 'contrat',
      source: 'pdf',
      issuer: 'Matmut',
      date: addDays(today, -1500),
      amount: 238.8,
      sizeKb: 980,
      contractId: 'c_hab_matmut',
      tags: ['habitation', 'matmut', 'ancien logement'],
      sharedWith: [],
      text:
        'Matmut — Contrat multirisque habitation n° MH-2290147. Logement assuré : 14 rue des Lilas, 69007 Lyon, ' +
        'appartement 52 m². Cotisation annuelle 238,80 €. Reconduction tacite. ' +
        'Ce logement a été quitté lors du déménagement.',
    }),
    doc({
      name: `${year}-facture-fitpark.pdf`,
      originalName: 'fitpark_facture.pdf',
      category: 'autre',
      docType: 'facture',
      source: 'email',
      issuer: 'FitPark',
      date: addDays(today, -9),
      amount: 34.9,
      sizeKb: 62,
      contractId: 'c_gym',
      tags: ['sport', 'abonnement'],
      sharedWith: [],
      text:
        'FitPark — Facture abonnement mensuel Premium. Montant 34,90 €. Dernier passage en salle enregistré il y a plus de sept mois. ' +
        'Résiliation possible par lettre recommandée avec accusé de réception, préavis 30 jours.',
    }),
    doc({
      name: `${year}-assurance-vie-releve-annuel.pdf`,
      originalName: 'AV_releve.pdf',
      category: 'banque',
      docType: 'releve',
      source: 'pdf',
      issuer: 'Crédit Mutuel',
      date: addDays(today, -95),
      amount: 42800,
      sizeKb: 310,
      tags: ['assurance vie', 'épargne', 'succession'],
      sharedWith: ['m_conjoint'],
      text:
        "Crédit Mutuel — Relevé annuel de situation du contrat d'assurance vie n° AV-4471982. Titulaire : Hélène Moreau. " +
        'Valeur de rachat au 31 décembre : 42 800 €. Répartition : fonds euros 70 %, unités de compte 30 %. ' +
        'Clause bénéficiaire : mon conjoint, à défaut mes enfants nés ou à naître, à défaut mes héritiers.',
    }),
    doc({
      name: `${year}-livret-famille.jpg`,
      originalName: 'livret.jpg',
      category: 'autre',
      docType: 'justificatif',
      source: 'photo',
      issuer: 'Mairie de Lyon',
      date: addDays(today, -1800),
      sizeKb: 1420,
      tags: ['état civil', 'famille', 'succession'],
      sharedWith: ['m_conjoint'],
      confidence: 0.9,
      text:
        'Livret de famille — Mairie de Lyon 3e arrondissement. Époux : Julien Moreau et Hélène Moreau. ' +
        'Enfant : Théo Moreau. Document d’état civil à conserver.',
    }),
    doc({
      name: `${year - 1}-declaration-revenus.pdf`,
      originalName: 'declaration.pdf',
      category: 'impots',
      docType: 'avis',
      source: 'email',
      issuer: 'DGFiP',
      date: addDays(today, -430),
      sizeKb: 176,
      tags: ['déclaration', 'impôts'],
      sharedWith: ['m_conjoint'],
      text:
        `Déclaration des revenus de l'année ${year - 2}, déposée en ligne. Accusé de réception impots.gouv.fr. ` +
        'Traitements et salaires déclarés : 56 100 €. Aucun revenu foncier.',
    }),
    doc({
      name: `${year}-facture-edf-precedente.pdf`,
      originalName: 'edf_prec.pdf',
      category: 'energie',
      docType: 'facture',
      source: 'pdf',
      issuer: 'EDF',
      date: addDays(today, -36),
      amount: 121.4,
      sizeKb: 298,
      contractId: 'c_energie_edf',
      tags: ['électricité', 'facture'],
      sharedWith: [],
      text:
        "EDF — Facture d'électricité du mois précédent. Référence client 4820193746. Consommation 471 kWh. " +
        'Montant total TTC : 121,40 €.',
    }),
  ];

  // Rattache les documents à leurs contrats
  for (const d of documents) {
    if (!d.contractId) continue;
    const c = contracts.find((x) => x.id === d.contractId);
    if (c) c.documentIds.push(d.id);
  }

  /* ---------------------------------------------------------------------
     Échéances
     --------------------------------------------------------------------- */
  const deadlines: Deadline[] = [
    {
      id: uid('dl'),
      title: 'Contrôle technique — Peugeot 308',
      date: addDays(today, 45),
      kind: 'controle-technique',
      category: 'vehicule',
      detected: true,
      done: false,
      note: 'Détecté dans le procès-verbal Autosur.',
    },
    {
      id: uid('dl'),
      title: "Fin de contrat — Assurance auto AXA",
      date: addDays(today, 45),
      kind: 'renouvellement-assurance',
      category: 'vehicule',
      contractId: 'c_auto_axa',
      detected: true,
      done: false,
      note: 'Préavis de 30 jours : décision à prendre sous 15 jours.',
    },
    {
      id: uid('dl'),
      title: 'Date anniversaire — Assurance habitation MAIF',
      date: addDays(today, 96),
      kind: 'anniversaire',
      category: 'assurance',
      contractId: 'c_hab_maif',
      detected: true,
      done: false,
      note: 'Reconduction tacite si aucune dénonciation 60 jours avant.',
    },
    {
      id: uid('dl'),
      title: 'Solde de l’impôt sur le revenu',
      date: addDays(today, 6),
      kind: 'impots',
      category: 'impots',
      detected: true,
      done: false,
      note: "Détecté dans l'avis d'imposition.",
    },
    {
      id: uid('dl'),
      title: 'Paiement de la taxe foncière',
      date: addDays(today, 28),
      kind: 'impots',
      category: 'impots',
      detected: true,
      done: false,
    },
    {
      id: uid('dl'),
      title: 'Fin d’engagement — Gaz Engie',
      date: addDays(today, 65),
      kind: 'fin-contrat',
      category: 'energie',
      contractId: 'c_gaz_engie',
      detected: true,
      done: false,
    },
    {
      id: uid('dl'),
      title: 'Fin d’engagement — Salle de sport FitPark',
      date: addDays(today, 120),
      kind: 'fin-contrat',
      category: 'autre',
      contractId: 'c_gym',
      detected: true,
      done: false,
      note: 'Préavis 30 jours par lettre recommandée.',
    },
    {
      id: uid('dl'),
      title: 'Renouvellement mutuelle Harmonie',
      date: addDays(today, 122),
      kind: 'renouvellement-assurance',
      category: 'sante',
      contractId: 'c_mutuelle',
      detected: true,
      done: false,
    },
    {
      id: uid('dl'),
      title: "Remise de l'attestation d'assurance au bailleur",
      date: addDays(today, 1),
      kind: 'autre',
      category: 'logement',
      detected: false,
      done: false,
      note: 'Obligation annuelle prévue au bail.',
    },
    {
      id: uid('dl'),
      title: 'Fin d’engagement — Fibre Orange',
      date: addDays(today, 330),
      kind: 'fin-contrat',
      category: 'internet',
      contractId: 'c_box_orange',
      detected: true,
      done: false,
    },
  ];

  /* ---------------------------------------------------------------------
     Factures — 18 mois d'historique, base de la détection d'anomalies
     --------------------------------------------------------------------- */
  const bills: Bill[] = [];
  const baselines: { provider: string; category: Bill['category']; base: number; contractId: string }[] = [
    { provider: 'EDF', category: 'energie', base: 118, contractId: 'c_energie_edf' },
    { provider: 'Engie', category: 'energie', base: 54, contractId: 'c_gaz_engie' },
    { provider: 'Orange', category: 'internet', base: 44, contractId: 'c_box_orange' },
    { provider: 'Harmonie Mutuelle', category: 'sante', base: 140, contractId: 'c_mutuelle' },
  ];

  for (const b of baselines) {
    for (let i = 17; i >= 0; i--) {
      const monthIso = addMonths(today, -i);
      // Variation saisonnière douce + bruit déterministe (pas d'aléatoire :
      // le jeu de démo doit rester reproductible).
      const seasonal = b.category === 'energie' ? 1 + 0.12 * Math.cos((mm(monthIso) - 1) * (Math.PI / 6)) : 1;
      const noise = 1 + ((i * 37) % 11) / 200 - 0.025;
      let amount = b.base * seasonal * noise;

      // Anomalie mise en scène : la dernière facture EDF dépasse largement la moyenne
      if (b.provider === 'EDF' && i === 0) amount = 164.2;
      // Hausse tarifaire Orange à la fin de la promotion (12 derniers mois)
      if (b.provider === 'Orange' && i <= 7) amount = 49.99;

      bills.push({
        id: uid('bill'),
        category: b.category,
        provider: b.provider,
        period: period(monthIso),
        amount: Math.round(amount * 100) / 100,
        contractId: b.contractId,
      });
    }
  }

  /* ---------------------------------------------------------------------
     Espace fiscal
     --------------------------------------------------------------------- */
  const taxes: TaxRecord[] = [
    {
      id: uid('tax'),
      year,
      kind: 'declaration',
      status: 'depose',
      dueDate: `${year}-06-06`,
      note: 'Déclaration en ligne validée.',
    },
    {
      id: uid('tax'),
      year: year - 1,
      kind: 'avis-imposition',
      amount: 3418,
      status: 'paye',
      dueDate: `${year - 1}-09-15`,
    },
    {
      id: uid('tax'),
      year,
      kind: 'avis-imposition',
      amount: 3612,
      status: 'a-faire',
      dueDate: addDays(today, 6),
      note: 'Solde restant dû après prélèvement à la source.',
    },
    {
      id: uid('tax'),
      year,
      kind: 'taxe-fonciere',
      amount: 1284,
      status: 'a-faire',
      dueDate: addDays(today, 28),
    },
    {
      id: uid('tax'),
      year: year - 1,
      kind: 'taxe-fonciere',
      amount: 1216,
      status: 'paye',
      dueDate: `${year - 1}-10-15`,
    },
    {
      id: uid('tax'),
      year,
      kind: 'revenus',
      amount: 37440,
      status: 'depose',
      note: 'Cumul des bulletins de paie de l’année.',
    },
  ];

  /* ---------------------------------------------------------------------
     Patrimoine / succession
     --------------------------------------------------------------------- */
  const estate: EstateAsset[] = [
    {
      id: uid('as'),
      label: "Assurance vie — Crédit Mutuel",
      kind: 'assurance-vie',
      value: 42800,
      institution: 'Crédit Mutuel',
      beneficiaries: ['m_conjoint'],
      documentIds: [],
      notes: 'Clause bénéficiaire : conjoint, à défaut les enfants.',
    },
    {
      id: uid('as'),
      label: 'Compte courant joint',
      kind: 'compte',
      value: 4218,
      institution: 'Crédit Mutuel',
      beneficiaries: ['m_conjoint'],
      documentIds: [],
    },
    {
      id: uid('as'),
      label: 'Peugeot 308 — AB-742-CD',
      kind: 'vehicule',
      value: 9500,
      beneficiaries: ['m_conjoint'],
      documentIds: [],
    },
    {
      id: uid('as'),
      label: 'Livret de famille',
      kind: 'document',
      beneficiaries: ['m_conjoint', 'm_mere'],
      documentIds: [],
      notes: 'Pièce d’état civil indispensable au règlement d’une succession.',
    },
    {
      id: uid('as'),
      label: 'Studio locatif — Villeurbanne',
      kind: 'immobilier',
      value: 148000,
      beneficiaries: ['m_conjoint', 'm_fils'],
      documentIds: [],
      notes: 'Acquis en indivision, acte chez Me Fabre.',
    },
  ];

  // Rattache quelques documents aux actifs
  const avDoc = documents.find((d) => d.tags.includes('assurance vie'));
  if (avDoc) estate[0].documentIds.push(avDoc.id);
  const livret = documents.find((d) => d.tags.includes('état civil'));
  if (livret) estate[3].documentIds.push(livret.id);
  const cg = documents.find((d) => d.tags.includes('carte grise'));
  if (cg) estate[2].documentIds.push(cg.id);

  /* ---------------------------------------------------------------------
     Projet de déménagement (inactif par défaut, activable depuis l'écran)
     --------------------------------------------------------------------- */
  const moving: MovingProject = {
    id: uid('mv'),
    fromAddress: '14 avenue Gambetta, 69003 Lyon',
    toAddress: '',
    date: addDays(today, 75),
    active: false,
    tasks: [],
  };

  return {
    version: 1,
    profile: {
      firstName: 'Hélène',
      lastName: 'Moreau',
      email: 'helene.moreau@example.fr',
      address: '14 avenue Gambetta',
      postalCode: '69003',
      city: 'Lyon',
      phone: '06 12 34 56 78',
      birthDate: '1986-04-17',
      readOnlyMode: false,
    },
    documents,
    contracts,
    deadlines,
    members,
    bills,
    taxes,
    estate,
    moving,
    chat: [],
    readAlertIds: [],
    timelineExtra: [
      {
        id: uid('tl'),
        date: addDays(today, -1120),
        title: 'Emménagement avenue Gambetta',
        description: 'Signature du bail et état des lieux d’entrée pour l’appartement de 74 m².',
        kind: 'demenagement',
        category: 'logement',
      },
      {
        id: uid('tl'),
        date: addDays(today, -680),
        title: 'Achat de la Peugeot 308',
        description: 'Véhicule immatriculé AB-742-CD, financé au comptant.',
        kind: 'achat',
        category: 'vehicule',
      },
      {
        id: uid('tl'),
        date: addDays(today, -560),
        title: 'Changement de fournisseur d’énergie',
        description: 'Passage au Tarif Bleu EDF après comparaison des offres.',
        kind: 'contrat',
        category: 'energie',
      },
    ],
  };
}

/* -------------------------------------------------------------------------
   Fabriques internes
   ------------------------------------------------------------------------- */

type DocSeed = Omit<DocumentItem, 'id' | 'addedAt' | 'archived' | 'confidence'> &
  Partial<Pick<DocumentItem, 'confidence'>>;

function doc(input: DocSeed): DocumentItem {
  return {
    id: uid('doc'),
    archived: false,
    confidence: 0.97,
    addedAt: input.date,
    ...input,
  };
}

function mm(iso: string): number {
  return Number(iso.slice(5, 7));
}

function pad(n: number): string {
  return `${n}`.padStart(2, '0');
}

function frDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

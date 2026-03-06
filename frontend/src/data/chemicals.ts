/**
 * Shared chemical master data (Location, Formula, Name).
 * Used across Chemical Log Book, Chemical Prep, and future Stock/Assignment pages.
 */

export interface ChemicalItem {
  location: string;
  formula: string;
  name: string;
  stockConcentration: number;
}

export const CHEMICALS: ChemicalItem[] = [
  // Water system
  { location: "Water system", formula: "NaOCl", name: "Sodium Hypochlorite", stockConcentration: 99 },
  { location: "Water system", formula: "NaOH", name: "Sodium Hydroxide", stockConcentration: 95 },
  { location: "Water system", formula: "SMBS", name: "Sodium Metabisulfite", stockConcentration: 50 },
  { location: "Water system", formula: "NaClO₂", name: "Sodium Chlorite", stockConcentration: 100 },
  { location: "Water system", formula: "NaCl", name: "Sodium Chloride", stockConcentration: 100 },
  { location: "Water system", formula: "HCl", name: "Hydrochloric Acid", stockConcentration: 37 },
  { location: "Water system", formula: "Citric acid", name: "Citric Acid", stockConcentration: 100 },
  { location: "Water system", formula: "Nitric acid", name: "Nitric Acid", stockConcentration: 70 },
  { location: "Water system", formula: "H2O2", name: "Hydrogen Peroxide", stockConcentration: 30 },
  { location: "Water system", formula: "Minncare", name: "Minncare Disinfectant Solution", stockConcentration: 100 },
  { location: "Water system", formula: "Antiscalant Grade", name: "Antiscalant Chemical", stockConcentration: 100 },
  { location: "Water system", formula: "Antifoulant", name: "Antifoulant Chemical", stockConcentration: 100 },
  // Cooling towers
  { location: "Cooling towers", formula: "Indochem CG 75", name: "Indochem CG 75", stockConcentration: 100 },
  { location: "Cooling towers", formula: "Indochem CG 90", name: "Indochem CG 90", stockConcentration: 100 },
  { location: "Cooling towers", formula: "Pennetreat 3110", name: "Pennetreat 3110", stockConcentration: 100 },
  { location: "Cooling towers", formula: "Pennetreat 3007", name: "Pennetreat 3007", stockConcentration: 100 },
  { location: "Cooling towers", formula: "Pennetreat 3009", name: "Pennetreat 3009", stockConcentration: 100 },
  // Boiler
  { location: "Boiler", formula: "Oxygen Scavenger", name: "Oxygen Scavenger", stockConcentration: 100 },
  { location: "Boiler", formula: "pH booster", name: "pH Booster", stockConcentration: 100 },
  { location: "Boiler", formula: "Antiscalant", name: "Antiscalant", stockConcentration: 100 },
];

/** Display strings for dropdowns (formula – name) */
export const CHEMICAL_NAMES = CHEMICALS.map((c) => `${c.formula} – ${c.name}`);

/** For ChemicalPrepPage: { name, stockConcentration, formula } */
export const chemicalsForPrep = CHEMICALS.map((c) => ({
  name: `${c.formula} – ${c.name}`,
  stockConcentration: c.stockConcentration,
  formula: c.formula,
}));

// Common South African medications for autocomplete
// Source: SAMF (South African Medicines Formulary), essential drugs list
export const COMMON_MEDICATIONS_SA = [
  // Cardiovascular
  'Amlodipine', 'Atenolol', 'Bisoprolol', 'Captopril', 'Carvedilol',
  'Enalapril', 'Furosemide', 'Hydrochlorothiazide', 'Indapamide',
  'Lisinopril', 'Losartan', 'Metoprolol', 'Nifedipine', 'Perindopril',
  'Ramipril', 'Spironolactone', 'Valsartan',
  // Lipid-lowering
  'Atorvastatin', 'Fenofibrate', 'Gemfibrozil', 'Rosuvastatin', 'Simvastatin',
  // Diabetes
  'Glibenclamide', 'Gliclazide', 'Glimepiride', 'Insulin (Actrapid)',
  'Insulin (Protaphane)', 'Metformin', 'Sitagliptin',
  // Respiratory
  'Beclomethasone', 'Budesonide', 'Fluticasone', 'Formoterol',
  'Ipratropium', 'Montelukast', 'Salbutamol', 'Salmeterol', 'Theophylline',
  // Pain / Anti-inflammatory
  'Aspirin', 'Celecoxib', 'Diclofenac', 'Ibuprofen', 'Naproxen',
  'Paracetamol', 'Tramadol',
  // Antibiotics (common courses)
  'Amoxicillin', 'Amoxicillin-Clavulanate', 'Azithromycin', 'Ciprofloxacin',
  'Clindamycin', 'Co-trimoxazole', 'Doxycycline', 'Erythromycin',
  'Metronidazole', 'Nitrofurantoin',
  // Mental health
  'Amitriptyline', 'Citalopram', 'Clonazepam', 'Diazepam', 'Escitalopram',
  'Fluoxetine', 'Haloperidol', 'Lorazepam', 'Paroxetine', 'Sertraline',
  'Venlafaxine',
  // Thyroid
  'Carbimazole', 'Levothyroxine',
  // Supplements / vitamins
  'Calcium + Vitamin D', 'Ferrous Sulphate', 'Folic Acid',
  'Magnesium', 'Vitamin B12', 'Vitamin D3', 'Zinc',
  // HIV / TB (important in SA context)
  'Dolutegravir', 'Efavirenz', 'Emtricitabine', 'Isoniazid',
  'Lamivudine', 'Pyrazinamide', 'Rifampicin', 'Tenofovir',
  // GI
  'Esomeprazole', 'Lactulose', 'Loperamide', 'Omeprazole',
  'Pantoprazole', 'Ranitidine',
  // Other
  'Allopurinol', 'Colchicine', 'Prednisolone', 'Warfarin',
] as const

export const MEDICATION_FORMS = [
  { value: 'tablet',    label: 'Tablet' },
  { value: 'capsule',   label: 'Capsule' },
  { value: 'liquid',    label: 'Liquid / Syrup' },
  { value: 'injection', label: 'Injection' },
  { value: 'patch',     label: 'Patch' },
  { value: 'inhaler',   label: 'Inhaler' },
  { value: 'drops',     label: 'Drops' },
  { value: 'other',     label: 'Other' },
] as const

export const STRENGTH_UNITS = ['mg', 'g', 'mcg', 'ml', 'IU', '%', 'units'] as const

export const DOSE_UNITS = ['tablet(s)', 'capsule(s)', 'ml', 'drop(s)', 'puff(s)', 'unit(s)'] as const

export const FREQUENCY_OPTIONS = [
  { value: 'daily',             label: 'Once daily' },
  { value: 'twice_daily',       label: 'Twice daily' },
  { value: 'three_times_daily', label: 'Three times daily' },
  { value: 'weekly',            label: 'Weekly' },
  { value: 'as_needed',         label: 'As needed (PRN)' },
  { value: 'custom',            label: 'Custom schedule' },
] as const

export const DEFAULT_TIMES: Record<string, string[]> = {
  daily:             ['08:00'],
  twice_daily:       ['08:00', '20:00'],
  three_times_daily: ['08:00', '13:00', '20:00'],
  weekly:            ['08:00'],
  as_needed:         [],
  custom:            [],
}

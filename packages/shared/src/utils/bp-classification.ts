// ── Blood Pressure Classification (WHO / ESH 2023 guidelines) ──
// Used for colour-coding BP readings in charts and lists.

export type BPCategory =
  | 'optimal'        // <120/80
  | 'normal'         // 120-129/80-84
  | 'high_normal'    // 130-139/85-89
  | 'stage1'         // 140-159/90-99
  | 'stage2'         // 160-179/100-109
  | 'stage3'         // ≥180/≥110
  | 'isolated_sys'   // ≥140 systolic, <90 diastolic
  | 'hypotension'    // <90/60

export type BPClassification = {
  category: BPCategory
  label: string
  color: string       // hex
  bgColor: string     // hex for card background
  urgent: boolean
}

const CLASSIFICATIONS: Record<BPCategory, BPClassification> = {
  hypotension:  { category: 'hypotension',  label: 'Low BP',       color: '#2563eb', bgColor: '#dbeafe', urgent: true  },
  optimal:      { category: 'optimal',      label: 'Optimal',      color: '#059669', bgColor: '#d1fae5', urgent: false },
  normal:       { category: 'normal',       label: 'Normal',       color: '#16a34a', bgColor: '#dcfce7', urgent: false },
  high_normal:  { category: 'high_normal',  label: 'High Normal',  color: '#ca8a04', bgColor: '#fef9c3', urgent: false },
  stage1:       { category: 'stage1',       label: 'Stage 1 High', color: '#d97706', bgColor: '#fef3c7', urgent: false },
  stage2:       { category: 'stage2',       label: 'Stage 2 High', color: '#ea580c', bgColor: '#ffedd5', urgent: true  },
  stage3:       { category: 'stage3',       label: 'Stage 3 High', color: '#dc2626', bgColor: '#fee2e2', urgent: true  },
  isolated_sys: { category: 'isolated_sys', label: 'Isolated Sys', color: '#b45309', bgColor: '#fef3c7', urgent: false },
}

/**
 * Classify a blood pressure reading.
 * Returns null if values are physiologically impossible.
 */
export function classifyBP(
  systolic: number,
  diastolic: number,
): BPClassification | null {
  if (systolic < 40 || systolic > 300 || diastolic < 20 || diastolic > 200) return null
  if (systolic < 90 || diastolic < 60) return CLASSIFICATIONS.hypotension
  if (systolic >= 180 || diastolic >= 110) return CLASSIFICATIONS.stage3
  if (systolic >= 160 || diastolic >= 100) return CLASSIFICATIONS.stage2
  if (systolic >= 140 && diastolic < 90)   return CLASSIFICATIONS.isolated_sys
  if (systolic >= 140 || diastolic >= 90)  return CLASSIFICATIONS.stage1
  if (systolic >= 130 || diastolic >= 85)  return CLASSIFICATIONS.high_normal
  if (systolic >= 120 || diastolic >= 80)  return CLASSIFICATIONS.normal
  return CLASSIFICATIONS.optimal
}

/** Mean arterial pressure */
export function meanArterialPressure(systolic: number, diastolic: number): number {
  return Math.round(diastolic + (systolic - diastolic) / 3)
}

/** Pulse pressure */
export function pulsePressure(systolic: number, diastolic: number): number {
  return systolic - diastolic
}

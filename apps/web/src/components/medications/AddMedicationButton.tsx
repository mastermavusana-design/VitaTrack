'use client'

import { useState } from 'react'
import MedicationForm from './MedicationForm'

export default function AddMedicationButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-sm">+ Add medication</button>
      <MedicationForm open={open} onClose={() => setOpen(false)} mode="add" />
    </>
  )
}

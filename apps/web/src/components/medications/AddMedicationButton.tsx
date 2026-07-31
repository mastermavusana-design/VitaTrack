'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import MedicationForm from './MedicationForm'

/** Reads the ?add=1&barcode=... params (from the barcode scanner) to auto-open the form. */
function AddMedicationInner() {
  const [open, setOpen] = useState(false)
  const [barcode, setBarcode] = useState<string | undefined>(undefined)
  const params = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    if (params.get('add') === '1') {
      setBarcode(params.get('barcode') ?? undefined)
      setOpen(true)
    }
  }, [params])

  function handleClose() {
    setOpen(false)
    setBarcode(undefined)
    if (params.get('add')) router.replace('/dashboard/medications')
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-sm">+ Add medication</button>
      <MedicationForm open={open} onClose={handleClose} mode="add" barcode={barcode} />
    </>
  )
}

export default function AddMedicationButton() {
  return (
    <Suspense fallback={<button className="btn-primary text-sm" disabled>+ Add medication</button>}>
      <AddMedicationInner />
    </Suspense>
  )
}

'use client'

import { useState } from 'react'
import ChildForm from './ChildForm'

export default function AddChildButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary text-sm">+ Add child</button>
      <ChildForm open={open} onClose={() => setOpen(false)} />
    </>
  )
}

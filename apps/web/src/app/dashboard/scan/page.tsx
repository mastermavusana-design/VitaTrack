import type { Metadata } from 'next'
import ScanClient from '@/components/scan/ScanClient'
import type { VitalType } from '@vitatrack/shared'

export const metadata: Metadata = { title: 'Scan — VitaTrack' }
export const dynamic = 'force-dynamic'

type Artifact = 'device_screen' | 'prescription' | 'document' | 'medication'
const ARTIFACTS: Artifact[] = ['device_screen', 'prescription', 'document', 'medication']

export default function ScanPage({
  searchParams,
}: {
  searchParams: { artifact?: string; vitalType?: string }
}) {
  const artifact = ARTIFACTS.includes(searchParams.artifact as Artifact)
    ? (searchParams.artifact as Artifact)
    : 'device_screen'
  const vitalHint = searchParams.vitalType as VitalType | undefined

  return <ScanClient artifact={artifact} vitalHint={vitalHint} />
}

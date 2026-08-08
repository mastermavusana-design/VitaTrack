import type { SVGProps } from 'react'

/**
 * A small set of consistent, stroke-based line icons for the navigation shell.
 * 24×24 viewBox, 1.9 stroke, rounded — reads cleanly at 20–22px.
 */

type IconProps = SVGProps<SVGSVGElement>

const base = (props: IconProps) => ({
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
})

export const HomeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </svg>
)

export const VitalsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12h4l2-6 4 12 2-6h6" />
  </svg>
)

export const ChildIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="5.5" r="2.5" />
    <path d="M12 8v7" />
    <path d="M7.5 11.5 12 10l4.5 1.5" />
    <path d="M9.5 21l2.5-6 2.5 6" />
  </svg>
)

export const PillIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)" />
    <path d="M8.5 8.5 15.5 15.5" />
  </svg>
)

export const RecordsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </svg>
)

export const BellIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
)

export const EmergencyIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3 4 6v5c0 5 3.4 8 8 10 4.6-2 8-5 8-10V6Z" />
    <path d="M12 8v4M12 15.5v.5" />
  </svg>
)

export const FamilyIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="9" r="3" />
    <circle cx="17" cy="10" r="2.4" />
    <path d="M2.5 20a5.5 5.5 0 0 1 11 0M14.5 20a4.5 4.5 0 0 1 7 0" />
  </svg>
)

export const SettingsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6.2 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.4H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 6.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.4V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1A1.7 1.7 0 0 0 21 10.6h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
  </svg>
)

export const ScanIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M4 12h16" />
  </svg>
)

export const ChevronIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m15 6-6 6 6 6" />
  </svg>
)

export const MenuIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </svg>
)

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const SignOutIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 12h10M17 9l3 3-3 3M4 4v16" />
  </svg>
)

import { create } from 'zustand'

type DrawerState = {
  open: boolean
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
}

/**
 * Global navigation-drawer state. Kept tiny and outside the React tree so any
 * screen header can open the drawer without prop-drilling or context.
 */
export const useDrawer = create<DrawerState>(set => ({
  open: false,
  openDrawer: () => set({ open: true }),
  closeDrawer: () => set({ open: false }),
  toggleDrawer: () => set(s => ({ open: !s.open })),
}))

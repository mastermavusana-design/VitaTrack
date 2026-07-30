import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Colors } from '@/constants/Colors'
import MenuButton from '@/components/MenuButton'

type Props = {
  /** Simple title text rendered next to the hamburger. */
  title?: string
  /**
   * Custom content to render on the left instead of `title` (e.g. a greeting
   * block). The hamburger is always rendered before it.
   */
  titleSlot?: ReactNode
  /** Content rendered on the right (action buttons, avatar, etc). */
  right?: ReactNode
  /** Colour of the hamburger bars. Defaults to white for the blue header. */
  menuColor?: string
}

/**
 * Shared top bar for the primary (app) screens: a branded blue header with the
 * navigation hamburger on the left, a title (or custom slot), and optional
 * right-side actions. Sits inside each screen's SafeAreaView.
 */
export default function ScreenHeader({ title, titleSlot, right, menuColor = '#fff' }: Props) {
  return (
    <View style={s.header}>
      <View style={s.left}>
        <MenuButton color={menuColor} />
        {titleSlot ?? (title ? <Text style={s.title}>{title}</Text> : null)}
      </View>
      {right ? <View style={s.right}>{right}</View> : null}
    </View>
  )
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})

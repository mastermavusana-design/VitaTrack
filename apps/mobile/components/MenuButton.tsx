import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { Colors } from '@/constants/Colors'
import { useDrawer } from '@/hooks/useDrawer'

type Props = {
  /** Colour of the three bars. Defaults to the primary text colour. */
  color?: string
}

/**
 * Accessible hamburger button. Draws three crisp bars with Views (sharper than
 * an emoji glyph and consistent across platforms) and opens the global drawer.
 */
export default function MenuButton({ color = Colors.text }: Props) {
  const openDrawer = useDrawer(s => s.openDrawer)

  return (
    <TouchableOpacity
      onPress={openDrawer}
      style={s.btn}
      accessibilityRole="button"
      accessibilityLabel="Open navigation menu"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.6}
    >
      <View style={[s.bar, { backgroundColor: color }]} />
      <View style={[s.bar, s.barMid, { backgroundColor: color }]} />
      <View style={[s.bar, { backgroundColor: color }]} />
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    width: 20,
    height: 2.5,
    borderRadius: 2,
  },
  barMid: {
    marginVertical: 4,
    width: 14, // slightly shorter middle bar for a refined look
    alignSelf: 'flex-start',
    marginLeft: 10,
  },
})

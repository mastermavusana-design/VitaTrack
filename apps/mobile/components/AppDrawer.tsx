import { useEffect, useState } from 'react'
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { router, usePathname } from 'expo-router'
import { Colors } from '@/constants/Colors'
import { useAuthStore } from '@/hooks/useAuth'
import { useDrawer } from '@/hooks/useDrawer'

type NavItem = {
  label: string
  icon: string
  path: string
  /** Route segment(s) used to decide the active state. */
  match: (pathname: string) => boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home',        icon: '🏠', path: '/(app)',             match: p => p === '/' || p === '/(app)' || p.endsWith('/index') },
  { label: 'Medications', icon: '💊', path: '/(app)/medications', match: p => p.includes('/medications') },
  { label: 'Vitals',      icon: '📊', path: '/(app)/vitals',      match: p => p.includes('/vitals') },
  { label: 'Records',     icon: '📂', path: '/(app)/records',     match: p => p.includes('/records') },
  { label: 'Profile',     icon: '👤', path: '/(app)/profile',     match: p => p.includes('/profile') || p.includes('/settings') },
]

const ANIM = { duration: 260, easing: Easing.out(Easing.cubic) }

export default function AppDrawer() {
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const open = useDrawer(s => s.open)
  const closeDrawer = useDrawer(s => s.closeDrawer)
  const pathname = usePathname()

  const user = useAuthStore(s => s.user)
  const signOut = useAuthStore(s => s.signOut)

  const DRAWER_W = Math.min(320, width * 0.84)

  // Keep the tree mounted through the exit animation, then unmount so the
  // drawer never intercepts touches while closed.
  const [rendered, setRendered] = useState(open)
  const progress = useSharedValue(open ? 1 : 0)

  useEffect(() => {
    if (open) {
      setRendered(true)
      progress.value = withTiming(1, ANIM)
    } else {
      progress.value = withTiming(0, ANIM, finished => {
        if (finished) runOnJS(setRendered)(false)
      })
    }
  }, [open])

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.5,
  }))

  const panelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [-DRAWER_W, 0]) },
    ],
  }))

  // Swipe-left-to-close gesture on the panel.
  const startProgress = useSharedValue(1)
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onBegin(() => {
      startProgress.value = progress.value
    })
    .onUpdate(e => {
      const next = startProgress.value + e.translationX / DRAWER_W
      progress.value = Math.min(1, Math.max(0, next))
    })
    .onEnd(e => {
      const shouldClose = progress.value < 0.6 || e.velocityX < -600
      if (shouldClose) {
        progress.value = withTiming(0, ANIM, finished => {
          if (finished) runOnJS(closeDrawer)()
        })
      } else {
        progress.value = withTiming(1, ANIM)
      }
    })

  if (!rendered) return null

  const name = (user?.user_metadata?.full_name as string) || 'VitaTrack User'
  const email = user?.email ?? ''
  const initials = name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const go = (path: string) => {
    closeDrawer()
    // Let the close animation start before navigating for a smoother feel.
    setTimeout(() => router.push(path as any), 60)
  }

  const handleSignOut = () => {
    closeDrawer()
    setTimeout(() => signOut(), 80)
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Scrim */}
      <Animated.View style={[StyleSheet.absoluteFill, s.scrim, scrimStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeDrawer}
          accessibilityLabel="Close menu"
          accessibilityRole="button"
        />
      </Animated.View>

      {/* Panel */}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            s.panel,
            { width: DRAWER_W, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 16 },
            panelStyle,
          ]}
        >
          {/* Brand */}
          <View style={s.brandRow}>
            <Image source={require('@/assets/images/icon.png')} style={s.brandIcon} />
            <Text style={s.brandName}>VitaTrack</Text>
          </View>

          {/* User card */}
          <View style={s.userCard}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials || 'V'}</Text>
            </View>
            <View style={s.userInfo}>
              <Text style={s.userName} numberOfLines={1}>{name}</Text>
              {!!email && <Text style={s.userEmail} numberOfLines={1}>{email}</Text>}
            </View>
          </View>

          {/* Nav */}
          <View style={s.nav}>
            {NAV_ITEMS.map(item => {
              const active = item.match(pathname)
              return (
                <TouchableOpacity
                  key={item.label}
                  style={[s.item, active && s.itemActive]}
                  onPress={() => go(item.path)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={item.label}
                >
                  {active && <View style={s.activeBar} />}
                  <Text style={s.itemIcon}>{item.icon}</Text>
                  <Text style={[s.itemLabel, active && s.itemLabelActive]}>{item.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Footer */}
          <View style={s.footer}>
            <TouchableOpacity
              style={s.signOut}
              onPress={handleSignOut}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <Text style={s.signOutIcon}>⏻</Text>
              <Text style={s.signOutLabel}>Sign out</Text>
            </TouchableOpacity>
            <Text style={s.version}>VitaTrack · v1.0</Text>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const s = StyleSheet.create({
  scrim: {
    backgroundColor: '#0F172A',
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.primaryBg,
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  userEmail: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  nav: {
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  itemActive: {
    backgroundColor: Colors.primaryBg,
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3.5,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  itemIcon: {
    fontSize: 20,
    width: 24,
    textAlign: 'center',
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  itemLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  signOutIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
    color: Colors.danger,
  },
  signOutLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.danger,
  },
  version: {
    fontSize: 11,
    color: Colors.textMuted,
    paddingHorizontal: 14,
    marginTop: 8,
  },
})

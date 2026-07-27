import { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Switch, Alert, ActivityIndicator, TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabaseClient } from '@vitatrack/shared'
import { useAuthStore } from '@/hooks/useAuth'
import { Colors } from '@/constants/Colors'

type ProfileSection = 'main' | 'family' | 'privacy' | 'notifications'

export default function ProfileScreen() {
  const [section, setSection] = useState<ProfileSection>('main')

  if (section === 'family')        return <FamilySharingView onBack={() => setSection('main')} />
  if (section === 'privacy')       return <PrivacyView onBack={() => setSection('main')} />
  if (section === 'notifications') return <NotificationsView onBack={() => setSection('main')} />

  return <ProfileMain onNavigate={setSection} />
}

/* ─── Main profile view ─── */
function ProfileMain({ onNavigate }: { onNavigate: (s: ProfileSection) => void }) {
  const { user, signOut } = useAuthStore()
  const supabase = getSupabaseClient()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').maybeSingle()
      return data
    },
  })

  const initials = (profile?.full_name ?? user?.email ?? '?')
    .split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ])
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>👤 Profile</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Avatar card */}
        <View style={s.avatarCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.profileName}>{profile?.full_name ?? 'Your Name'}</Text>
            <Text style={s.profileEmail}>{user?.email ?? ''}</Text>
            {profile?.date_of_birth && (
              <Text style={s.profileMeta}>
                DOB: {new Date(profile.date_of_birth).toLocaleDateString('en-ZA')}
              </Text>
            )}
          </View>
          <TouchableOpacity style={s.editProfileBtn} onPress={() => Alert.alert('Edit Profile', 'Coming soon')}>
            <Text style={s.editProfileText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Settings rows */}
        <SettingsGroup title="Account">
          <SettingsRow icon="👨‍👩‍👧" label="Family Sharing" sub="Invite caregivers & manage access" onPress={() => onNavigate('family')} />
          <SettingsRow icon="🔔" label="Notifications" sub="Reminders, alerts & caregiver pings" onPress={() => onNavigate('notifications')} />
        </SettingsGroup>

        <SettingsGroup title="Data & Privacy">
          <SettingsRow icon="🔒" label="Privacy & POPIA" sub="Export data, delete account, consent" onPress={() => onNavigate('privacy')} />
          <SettingsRow icon="🔐" label="Security" sub="Biometric lock, change password" onPress={() => Alert.alert('Security', 'Coming soon')} />
        </SettingsGroup>

        <SettingsGroup title="Support">
          <SettingsRow icon="❓" label="Help & FAQ" sub="How VitaTrack works" onPress={() => Alert.alert('Help', 'Coming soon')} />
          <SettingsRow icon="💬" label="Send Feedback" sub="Report a bug or suggest a feature" onPress={() => Alert.alert('Feedback', 'Coming soon')} />
          <SettingsRow icon="📃" label="Terms & Privacy Policy" sub="" onPress={() => Alert.alert('Legal', 'Coming soon')} />
        </SettingsGroup>

        <View style={s.appVersionRow}>
          <Text style={s.appVersion}>VitaTrack v1.0.0 · Built for South Africa 🇿🇦</Text>
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

/* ─── Family sharing ─── */
function FamilySharingView({ onBack }: { onBack: () => void }) {
  const supabase = getSupabaseClient()
  const qc = useQueryClient()
  const [inviteEmail, setInviteEmail] = useState('')
  const [isSending, setIsSending] = useState(false)

  const { data: members = [] } = useQuery({
    queryKey: ['family-members'],
    queryFn: async () => {
      const { data } = await supabase
        .from('family_members')
        .select('*, invitee:profiles!family_members_invitee_id_fkey(full_name, email)')
      return data ?? []
    },
  })

  const sendInvite = async () => {
    if (!inviteEmail.includes('@')) { Alert.alert('Invalid', 'Enter a valid email.'); return }
    setIsSending(true)
    const { error } = await supabase.functions.invoke('send-family-invite', {
      body: { invitee_email: inviteEmail },
    })
    setIsSending(false)
    if (error) { Alert.alert('Error', error.message); return }
    Alert.alert('Invite Sent', `An invitation was sent to ${inviteEmail}.`)
    setInviteEmail('')
    qc.invalidateQueries({ queryKey: ['family-members'] })
  }

  const revoke = async (id: string) => {
    await supabase.from('family_members').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['family-members'] })
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <SubHeader title="👨‍👩‍👧 Family Sharing" onBack={onBack} />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.infoCard}>
          <Text style={s.infoText}>
            Invite a caregiver (family member, carer, or nurse) to view your vitals and medication
            adherence in read-only mode. They'll receive missed-dose alerts for you.
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Invite Caregiver</Text>
          <View style={s.inviteRow}>
            {/* @ts-ignore */}
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="caregiver@email.com"
              placeholderTextColor="#aaa"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity style={s.inviteBtn} onPress={sendInvite} disabled={isSending}>
              {isSending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.inviteBtnText}>Send</Text>}
            </TouchableOpacity>
          </View>
          <Text style={s.fieldHint}>MVP: 1 caregiver maximum. They must have a VitaTrack account.</Text>
        </View>

        {members.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Active Caregivers</Text>
            {members.map((m: any) => (
              <View key={m.id} style={s.memberRow}>
                <View style={s.memberAvatar}>
                  <Text style={s.memberAvatarText}>
                    {(m.invitee?.full_name ?? m.invitee?.email ?? '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.memberName}>{m.invitee?.full_name ?? 'Pending'}</Text>
                  <Text style={s.memberEmail}>{m.invitee?.email}</Text>
                </View>
                <View style={[s.statusBadge, m.status === 'accepted' ? s.statusActive : s.statusPending]}>
                  <Text style={s.statusText}>{m.status}</Text>
                </View>
                <TouchableOpacity onPress={() => Alert.alert('Revoke Access', 'Remove this caregiver?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Revoke', style: 'destructive', onPress: () => revoke(m.id) },
                ])}>
                  <Text style={s.revokeText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

/* ─── Privacy / POPIA ─── */
function PrivacyView({ onBack }: { onBack: () => void }) {
  const supabase = getSupabaseClient()
  const { signOut } = useAuthStore()
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting]   = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('popia_consent_at').maybeSingle()
      return data
    },
  })

  const requestExport = async () => {
    setIsExporting(true)
    const { error } = await supabase.functions.invoke('data-export', {})
    setIsExporting(false)
    if (error) { Alert.alert('Error', error.message); return }
    Alert.alert('Export Requested', 'Your data export will be emailed to you within 24 hours, as required by POPIA.')
  }

  const requestDeletion = () => {
    Alert.alert(
      'Delete All Data',
      'This will permanently delete your account, all health records, and associated data. This cannot be undone. POPIA guarantees your right to erasure.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true)
            await supabase.functions.invoke('request-deletion', {})
            setIsDeleting(false)
            signOut()
          },
        },
      ]
    )
  }

  const consentDate = profile?.popia_consent_at
    ? new Date(profile.popia_consent_at).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <SubHeader title="🔒 Privacy & POPIA" onBack={onBack} />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.infoCard}>
          <Text style={s.infoTitle}>Your POPIA Rights</Text>
          <Text style={s.infoText}>
            Under the Protection of Personal Information Act (POPIA), you have the right to access,
            correct, and delete your personal health data. VitaTrack stores all data in South Africa
            (AWS af-south-1, Cape Town).
          </Text>
        </View>

        {consentDate && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Consent Record</Text>
            <Text style={s.consentText}>
              ✅ You gave data processing consent on {consentDate}. This consent is required for
              VitaTrack to store and process your health information.
            </Text>
          </View>
        )}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Your Data</Text>

          <View style={s.privacyRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.privacyRowTitle}>📦 Export My Data</Text>
              <Text style={s.privacyRowSub}>Download a copy of all your health records, visits, and vitals as a ZIP archive (CSV + PDFs). Sent to your email within 24 hours.</Text>
            </View>
            <TouchableOpacity style={s.exportBtn} onPress={requestExport} disabled={isExporting}>
              {isExporting ? <ActivityIndicator color={Colors.primary} size="small" /> : <Text style={s.exportBtnText}>Request</Text>}
            </TouchableOpacity>
          </View>
        </View>

        <View style={[s.section, s.dangerSection]}>
          <Text style={[s.sectionTitle, { color: Colors.danger }]}>Danger Zone</Text>

          <View style={s.privacyRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.privacyRowTitle, { color: Colors.danger }]}>🗑 Delete My Account</Text>
              <Text style={s.privacyRowSub}>Permanently remove your account and all associated health data. This is irreversible. You will be signed out immediately.</Text>
            </View>
          </View>
          <TouchableOpacity style={s.deleteBtn} onPress={requestDeletion} disabled={isDeleting}>
            {isDeleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.deleteBtnText}>Delete All My Data</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

/* ─── Notifications ─── */
function NotificationsView({ onBack }: { onBack: () => void }) {
  const supabase = getSupabaseClient()
  const [reminders, setReminders]   = useState(true)
  const [refillAlerts, setRefillAlerts] = useState(true)
  const [caregiverPing, setCaregiverPing] = useState(true)

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <SubHeader title="🔔 Notifications" onBack={onBack} />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.infoCard}>
          <Text style={s.infoText}>
            All reminders are sent locally and do not require an internet connection. Caregiver missed-dose
            alerts require push notifications to be enabled.
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Medication Reminders</Text>
          <ToggleRow
            label="Dose Reminders"
            sub="Notify me when it's time to take a medication"
            value={reminders}
            onChange={setReminders}
          />
          <ToggleRow
            label="Refill Alerts"
            sub="Warn me when pill count drops below threshold"
            value={refillAlerts}
            onChange={setRefillAlerts}
          />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Caregiver Alerts</Text>
          <ToggleRow
            label="Missed-Dose Pings"
            sub="Alert my caregiver if I miss a dose by 30+ minutes"
            value={caregiverPing}
            onChange={setCaregiverPing}
          />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Quiet Hours</Text>
          <View style={s.privacyRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.privacyRowTitle}>Do Not Disturb</Text>
              <Text style={s.privacyRowSub}>No reminders between 22:00 – 06:00</Text>
            </View>
            <Switch value={false} onValueChange={() => Alert.alert('Coming Soon')} trackColor={{ true: Colors.primary }} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

/* ─── Shared sub-components ─── */
function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onBack}>
        <Text style={s.backText}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ width: 60 }} />
    </View>
  )
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.settingsGroup}>
      <Text style={s.settingsGroupTitle}>{title}</Text>
      <View style={s.settingsGroupBody}>{children}</View>
    </View>
  )
}

function SettingsRow({ icon, label, sub, onPress }: { icon: string; label: string; sub: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.settingsRow} onPress={onPress}>
      <Text style={s.settingsRowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.settingsRowLabel}>{label}</Text>
        {sub ? <Text style={s.settingsRowSub}>{sub}</Text> : null}
      </View>
      <Text style={s.settingsRowChevron}>›</Text>
    </TouchableOpacity>
  )
}

function ToggleRow({ label, sub, value, onChange }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.privacyRowTitle}>{label}</Text>
        <Text style={s.privacyRowSub}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: Colors.primary }} />
    </View>
  )
}

const s = StyleSheet.create({
  root:              { flex: 1, backgroundColor: Colors.background },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle:       { fontSize: 17, fontWeight: '800', color: '#fff' },
  backText:          { color: '#fff', fontSize: 16 },
  scroll:            { padding: 16, gap: 12, paddingBottom: 40 },

  avatarCard:        { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  avatar:            { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText:        { fontSize: 24, fontWeight: '900', color: '#fff' },
  profileName:       { fontSize: 17, fontWeight: '800', color: Colors.text },
  profileEmail:      { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  profileMeta:       { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  editProfileBtn:    { backgroundColor: Colors.primaryBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#93C5FD' },
  editProfileText:   { fontSize: 13, fontWeight: '700', color: Colors.primary },

  settingsGroup:     { gap: 0 },
  settingsGroupTitle:{ fontSize: 11, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, paddingHorizontal: 4 },
  settingsGroupBody: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  settingsRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  settingsRowIcon:   { fontSize: 20, width: 28, textAlign: 'center' },
  settingsRowLabel:  { fontSize: 15, fontWeight: '600', color: Colors.text },
  settingsRowSub:    { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  settingsRowChevron:{ fontSize: 18, color: Colors.textMuted },

  section:           { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  sectionTitle:      { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  dangerSection:     { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },

  input:             { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  fieldHint:         { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  inviteRow:         { flexDirection: 'row', gap: 10, alignItems: 'center' },
  inviteBtn:         { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 13 },
  inviteBtnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },

  memberRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  memberAvatar:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText:  { fontSize: 16, fontWeight: '800', color: Colors.primary },
  memberName:        { fontSize: 14, fontWeight: '700', color: Colors.text },
  memberEmail:       { fontSize: 11, color: Colors.textMuted },
  statusBadge:       { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusActive:      { backgroundColor: Colors.successBg },
  statusPending:     { backgroundColor: Colors.warningBg },
  statusText:        { fontSize: 10, fontWeight: '700', color: Colors.text },
  revokeText:        { fontSize: 16, color: Colors.danger, paddingLeft: 4 },

  infoCard:          { backgroundColor: Colors.primaryBg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#93C5FD' },
  infoTitle:         { fontSize: 14, fontWeight: '800', color: Colors.primary, marginBottom: 6 },
  infoText:          { fontSize: 13, color: Colors.primary, lineHeight: 20 },
  consentText:       { fontSize: 13, color: Colors.text, lineHeight: 20 },

  privacyRow:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  privacyRowTitle:   { fontSize: 14, fontWeight: '700', color: Colors.text },
  privacyRowSub:     { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginTop: 2 },

  exportBtn:         { backgroundColor: Colors.primaryBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#93C5FD' },
  exportBtnText:     { fontSize: 13, fontWeight: '700', color: Colors.primary },
  deleteBtn:         { backgroundColor: Colors.danger, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  deleteBtnText:     { color: '#fff', fontSize: 14, fontWeight: '700' },

  toggleRow:         { flexDirection: 'row', alignItems: 'center', gap: 12 },

  appVersionRow:     { alignItems: 'center', paddingVertical: 8 },
  appVersion:        { fontSize: 11, color: Colors.textMuted },

  signOutBtn:        { backgroundColor: Colors.dangerBg, borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#FCA5A5' },
  signOutText:       { color: Colors.danger, fontSize: 16, fontWeight: '700' },
})

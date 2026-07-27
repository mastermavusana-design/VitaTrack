import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Share, Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import QRCode from 'react-native-qrcode-svg'
import { getSupabaseClient, ICE_BASE_URL } from '@vitatrack/shared'
import type { ICEProfile, EmergencyContact } from '@vitatrack/shared'
import { Colors } from '@/constants/Colors'

const BLOOD_TYPES = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−', 'Unknown']

export default function ICEScreen() {
  const [isEditing, setIsEditing] = useState(false)
  const supabase = getSupabaseClient()
  const qc = useQueryClient()

  const { data: ice, isLoading } = useQuery({
    queryKey: ['ice-profile'],
    queryFn: async () => {
      const { data } = await supabase.from('ice_profiles').select('*').maybeSingle()
      return data as ICEProfile | null
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<ICEProfile>) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = ice
        ? await supabase.from('ice_profiles').update(updates).eq('profile_id', user.id)
        : await supabase.from('ice_profiles').insert({ ...updates, profile_id: user.id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ice-profile'] })
      setIsEditing(false)
    },
    onError: (err: Error) => Alert.alert('Save failed', err.message),
  })

  const shareICE = async () => {
    if (!ice?.qr_token) return
    const url = `${ICE_BASE_URL}/${ice.qr_token}`
    await Share.share({ title: 'My ICE Profile', url, message: `My emergency health profile: ${url}` })
  }

  if (isLoading) {
    return <SafeAreaView style={s.root}><ActivityIndicator color={Colors.primary} style={{ flex: 1 }} /></SafeAreaView>
  }

  if (!ice || isEditing) {
    return (
      <ICEEditForm
        current={ice}
        onSave={d => saveMutation.mutate(d)}
        onCancel={() => setIsEditing(false)}
        isSaving={saveMutation.isPending}
      />
    )
  }

  const qrUrl = `${ICE_BASE_URL}/${ice.qr_token}`

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>🆘 ICE Profile</Text>
        <TouchableOpacity style={s.editBtn} onPress={() => setIsEditing(true)}>
          <Text style={s.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Identity card */}
        <View style={s.identityCard}>
          <Text style={s.emergencyLabel}>🆘 IN CASE OF EMERGENCY</Text>

          <View style={s.badgeRow}>
            {ice.blood_type ? (
              <View style={s.bloodTypeBadge}>
                <Text style={s.bloodTypeBadgeText}>Blood Type: {ice.blood_type}</Text>
              </View>
            ) : (
              <View style={s.bloodTypeBadge}>
                <Text style={s.bloodTypeBadgeText}>Blood Type: Unknown</Text>
              </View>
            )}
            {ice.organ_donor && (
              <View style={s.donorBadge}>
                <Text style={s.donorBadgeText}>Organ Donor</Text>
              </View>
            )}
            {ice.do_not_resuscitate && (
              <View style={[s.donorBadge, { backgroundColor: Colors.dangerBg }]}>
                <Text style={[s.donorBadgeText, { color: Colors.danger }]}>DNR</Text>
              </View>
            )}
          </View>
        </View>

        {/* Allergies */}
        <ICESection icon="⚠️" title="Allergies">
          {ice.allergies?.length
            ? <Text style={s.iceValue}>{ice.allergies.join(' · ')}</Text>
            : <Text style={s.icePlaceholder}>None recorded</Text>
          }
        </ICESection>

        {/* Conditions */}
        <ICESection icon="🏥" title="Medical Conditions">
          {ice.conditions?.length
            ? <Text style={s.iceValue}>{ice.conditions.join(' · ')}</Text>
            : <Text style={s.icePlaceholder}>None recorded</Text>
          }
        </ICESection>

        {/* Current medications */}
        {ice.medications?.length ? (
          <ICESection icon="💊" title="Current Medications">
            <Text style={s.iceValue}>{(ice.medications as string[]).join(' · ')}</Text>
          </ICESection>
        ) : null}

        {/* Emergency contacts */}
        <ICESection icon="📞" title="Emergency Contacts">
          {ice.emergency_contacts?.length ? (
            ice.emergency_contacts.map((c: EmergencyContact, i: number) => (
              <View key={i} style={s.contactRow}>
                <View style={s.contactAvatar}>
                  <Text style={s.contactAvatarText}>{c.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.contactNameRow}>
                    <Text style={s.contactName}>{c.name}</Text>
                    {c.is_primary && (
                      <View style={s.primaryBadge}><Text style={s.primaryBadgeText}>Primary</Text></View>
                    )}
                  </View>
                  <Text style={s.contactSub}>{c.relationship} · {c.phone}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={s.icePlaceholder}>No contacts added</Text>
          )}
        </ICESection>

        {/* QR Code + Share */}
        <View style={s.shareCard}>
          <View style={s.qrWrap}>
            {ice.qr_token ? (
              <QRCode
                value={qrUrl}
                size={80}
                color={Colors.primary}
                backgroundColor="transparent"
              />
            ) : (
              <Text style={s.qrIcon}>▣</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.shareTitle}>Share ICE Profile</Text>
            <Text style={s.shareSubtitle}>First responders can scan this QR code without unlocking your phone.</Text>
            <TouchableOpacity style={s.shareBtn} onPress={shareICE}>
              <Text style={s.shareBtnText}>📤 Share Link / QR</Text>
            </TouchableOpacity>
          </View>
        </View>

        {ice.additional_notes ? (
          <ICESection icon="📝" title="Additional Notes">
            <Text style={s.iceValue}>{ice.additional_notes}</Text>
          </ICESection>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function ICESection({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{icon} {title}</Text>
      {children}
    </View>
  )
}

/* ─── Edit form ─── */
function ICEEditForm({
  current, onSave, onCancel, isSaving,
}: {
  current: ICEProfile | null
  onSave: (d: Partial<ICEProfile>) => void
  onCancel: () => void
  isSaving: boolean
}) {
  const [allergies, setAllergies]     = useState(current?.allergies?.join(', ') ?? '')
  const [conditions, setConditions]   = useState(current?.conditions?.join(', ') ?? '')
  const [medications, setMedications] = useState((current?.medications as string[] | undefined)?.join(', ') ?? '')
  const [notes, setNotes]             = useState(current?.additional_notes ?? '')
  const [bloodType, setBloodType]     = useState<string>(current?.blood_type ?? 'Unknown')
  const [organDonor, setOrganDonor]   = useState(current?.organ_donor ?? false)
  const [dnr, setDnr]                 = useState(current?.do_not_resuscitate ?? false)

  // Contacts — support up to 2 for MVP
  const [c1Name,  setC1Name]  = useState(current?.emergency_contacts?.[0]?.name ?? '')
  const [c1Rel,   setC1Rel]   = useState(current?.emergency_contacts?.[0]?.relationship ?? '')
  const [c1Phone, setC1Phone] = useState(current?.emergency_contacts?.[0]?.phone ?? '')
  const [c2Name,  setC2Name]  = useState(current?.emergency_contacts?.[1]?.name ?? '')
  const [c2Rel,   setC2Rel]   = useState(current?.emergency_contacts?.[1]?.relationship ?? '')
  const [c2Phone, setC2Phone] = useState(current?.emergency_contacts?.[1]?.phone ?? '')

  const splitCSV = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)

  const save = () => {
    const contacts: EmergencyContact[] = []
    if (c1Name) contacts.push({ name: c1Name, relationship: c1Rel, phone: c1Phone, is_primary: true })
    if (c2Name) contacts.push({ name: c2Name, relationship: c2Rel, phone: c2Phone, is_primary: false })

    onSave({
      allergies:            splitCSV(allergies),
      conditions:           splitCSV(conditions),
      medications:          splitCSV(medications),
      additional_notes:     notes.trim() || null,
      blood_type:           bloodType === 'Unknown' ? null : bloodType,
      organ_donor:          organDonor,
      do_not_resuscitate:   dnr,
      emergency_contacts:   contacts,
      is_public:            true,
    })
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={onCancel}><Text style={s.editBtnText}>Cancel</Text></TouchableOpacity>
        <Text style={s.headerTitle}>Edit ICE Profile</Text>
        <TouchableOpacity onPress={save} disabled={isSaving} style={s.editBtn}>
          {isSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.editBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>

        {/* Blood type */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🩸 Blood Type</Text>
          <View style={s.chipRow}>
            {BLOOD_TYPES.map(bt => (
              <TouchableOpacity
                key={bt}
                style={[s.chip, bloodType === bt && s.chipActive]}
                onPress={() => setBloodType(bt)}
              >
                <Text style={[s.chipText, bloodType === bt && s.chipTextActive]}>{bt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Flags */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🏥 Medical Flags</Text>
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Organ Donor</Text>
              <Text style={s.toggleSub}>I consent to organ donation</Text>
            </View>
            <Switch
              value={organDonor}
              onValueChange={setOrganDonor}
              trackColor={{ true: Colors.success }}
            />
          </View>
          <View style={[s.toggleRow, { marginTop: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Do Not Resuscitate (DNR)</Text>
              <Text style={s.toggleSub}>I have a valid DNR directive</Text>
            </View>
            <Switch
              value={dnr}
              onValueChange={setDnr}
              trackColor={{ true: Colors.danger }}
            />
          </View>
        </View>

        {/* Allergies */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>⚠️ Allergies</Text>
          <TextInput
            style={s.input}
            placeholder="Penicillin, Sulfa drugs (comma-separated)"
            placeholderTextColor="#aaa"
            value={allergies}
            onChangeText={setAllergies}
            multiline
          />
        </View>

        {/* Conditions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🏥 Medical Conditions</Text>
          <TextInput
            style={s.input}
            placeholder="Type 2 Diabetes, Hypertension (comma-separated)"
            placeholderTextColor="#aaa"
            value={conditions}
            onChangeText={setConditions}
            multiline
          />
        </View>

        {/* Current medications */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>💊 Current Medications</Text>
          <TextInput
            style={s.input}
            placeholder="Metformin 500mg, Amlodipine 5mg (comma-separated)"
            placeholderTextColor="#aaa"
            value={medications}
            onChangeText={setMedications}
            multiline
          />
        </View>

        {/* Primary contact */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📞 Primary Emergency Contact</Text>
          <TextInput style={[s.input, { marginBottom: 8 }]} placeholder="Full name" placeholderTextColor="#aaa" value={c1Name} onChangeText={setC1Name} />
          <TextInput style={[s.input, { marginBottom: 8 }]} placeholder="Relationship (e.g. Son, Spouse)" placeholderTextColor="#aaa" value={c1Rel} onChangeText={setC1Rel} />
          <TextInput style={s.input} placeholder="+27 82 123 4567" placeholderTextColor="#aaa" keyboardType="phone-pad" value={c1Phone} onChangeText={setC1Phone} />
        </View>

        {/* Secondary contact */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📞 Secondary Contact (optional)</Text>
          <TextInput style={[s.input, { marginBottom: 8 }]} placeholder="Full name" placeholderTextColor="#aaa" value={c2Name} onChangeText={setC2Name} />
          <TextInput style={[s.input, { marginBottom: 8 }]} placeholder="Relationship" placeholderTextColor="#aaa" value={c2Rel} onChangeText={setC2Rel} />
          <TextInput style={s.input} placeholder="+27 82 123 4567" placeholderTextColor="#aaa" keyboardType="phone-pad" value={c2Phone} onChangeText={setC2Phone} />
        </View>

        {/* Notes */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📝 Additional Notes</Text>
          <TextInput
            style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
            placeholder="Pacemaker, implants, known allergic reaction details…"
            placeholderTextColor="#aaa"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:               { flex: 1, backgroundColor: Colors.background },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.danger, paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle:        { fontSize: 17, fontWeight: '800', color: '#fff' },
  editBtn:            { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  editBtnText:        { color: '#fff', fontSize: 15, fontWeight: '700' },
  scroll:             { padding: 16, gap: 12 },
  identityCard:       { backgroundColor: '#FEF2F2', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#FCA5A5' },
  emergencyLabel:     { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: Colors.danger, marginBottom: 10 },
  badgeRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bloodTypeBadge:     { backgroundColor: Colors.dangerBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  bloodTypeBadgeText: { color: Colors.danger, fontSize: 12, fontWeight: '700' },
  donorBadge:         { backgroundColor: Colors.warningBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  donorBadgeText:     { color: Colors.warning, fontSize: 12, fontWeight: '700' },
  section:            { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  sectionTitle:       { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, marginBottom: 10 },
  iceValue:           { fontSize: 16, fontWeight: '600', color: Colors.primary, lineHeight: 24 },
  icePlaceholder:     { fontSize: 14, color: Colors.textMuted, fontStyle: 'italic' },
  contactRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  contactAvatar:      { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.successBg, alignItems: 'center', justifyContent: 'center' },
  contactAvatarText:  { fontSize: 18, fontWeight: '800', color: Colors.success },
  contactNameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactName:        { fontSize: 15, fontWeight: '700', color: Colors.text },
  contactSub:         { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  primaryBadge:       { backgroundColor: Colors.successBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  primaryBadgeText:   { fontSize: 10, fontWeight: '700', color: Colors.success },
  shareCard:          { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', gap: 14, alignItems: 'center' },
  qrWrap:             { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  qrIcon:             { fontSize: 28, color: '#93C5FD' },
  shareTitle:         { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  shareSubtitle:      { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: 10 },
  shareBtn:           { backgroundColor: Colors.primaryBg, borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#93C5FD' },
  shareBtnText:       { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  input:              { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  chipRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:               { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border },
  chipActive:         { backgroundColor: Colors.danger, borderColor: Colors.danger },
  chipText:           { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive:     { color: '#fff' },
  toggleRow:          { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel:        { fontSize: 14, fontWeight: '700', color: Colors.text },
  toggleSub:          { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
})

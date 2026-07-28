import type { Metadata } from 'next'
import { LegalShell, LegalSection } from '@/components/LegalShell'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How VitaTrack collects, uses, stores, and protects your personal and health information under the Protection of Personal Information Act (POPIA).',
}

const LAST_UPDATED = '27 July 2026'

export default function PrivacyPolicyPage() {
  return (
    <LegalShell title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p>
        This Privacy Policy explains how <strong>VitaTrack</strong> (&ldquo;VitaTrack&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;), operated by <strong>[Registered Company Name]</strong>{' '}
        (registration number <strong>[Company Registration Number]</strong>), collects, uses,
        stores, shares, and protects your personal information. We are the{' '}
        <em>Responsible Party</em> for your personal information as defined in South Africa&rsquo;s{' '}
        <strong>Protection of Personal Information Act, 2013 (POPIA)</strong>.
      </p>
      <p>
        VitaTrack is a personal health companion for medication tracking, vital-sign records,
        document storage, caregiver sharing, and emergency (ICE) profiles. Because we process
        health information, we treat your data as <strong>special personal information</strong> and
        apply heightened safeguards.
      </p>

      <LegalSection id="responsible-party" heading="1. Responsible Party & Information Officer">
        <p>
          The Responsible Party is [Registered Company Name], [Registered Physical Address, South
          Africa]. Our appointed <strong>Information Officer</strong> (registered with the
          Information Regulator) can be reached at{' '}
          <a href="mailto:privacy@vitatrack.co.za" className="text-blue-600 underline">
            privacy@vitatrack.co.za
          </a>{' '}
          or <strong>[Information Officer telephone]</strong>.
        </p>
      </LegalSection>

      <LegalSection id="what-we-collect" heading="2. Personal information we collect">
        <p>We collect only what is necessary to provide the service:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Account &amp; identity:</strong> name, email address, phone number, date of
            birth, blood type, timezone, and profile photo (optional).
          </li>
          <li>
            <strong>Health information (special personal information):</strong> medications and
            schedules, dose logs, vital-sign readings (blood pressure, glucose, weight, temperature,
            SpO₂, heart rate), doctor visits, uploaded health documents, allergies, conditions, and
            emergency-contact details.
          </li>
          <li>
            <strong>Caregiver relationships:</strong> family-member invitations and their access
            role (viewer or dose logger).
          </li>
          <li>
            <strong>Technical:</strong> device push-notification tokens, app version, and
            security/audit logs of key actions on your account.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="how-we-use" heading="3. How and why we use your information">
        <p>We process your information for these purposes only:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>To provide medication reminders, adherence tracking, and vital-sign history.</li>
          <li>To share your data with caregivers you explicitly invite, at the access level you choose.</li>
          <li>To display an emergency (ICE) profile that you choose to make publicly accessible via a QR link.</li>
          <li>To send transactional notifications (reminders, caregiver alerts, refill warnings) you have enabled.</li>
          <li>To secure your account, detect misuse, and keep audit records.</li>
          <li>To comply with our legal obligations, including POPIA data-subject requests.</li>
        </ul>
        <p>We do <strong>not</strong> sell your personal information, and we do not use it for advertising.</p>
      </LegalSection>

      <LegalSection id="lawful-basis" heading="4. Lawful basis & consent">
        <p>
          We process ordinary personal information on the basis of the contract to provide you the
          service and our legitimate interests in operating it securely. Because health data is{' '}
          <strong>special personal information</strong> under section 26 of POPIA, we rely on your{' '}
          <strong>explicit consent</strong> (section 27) given when you create an account and add
          health data. You may withdraw consent at any time by deleting the relevant data or your
          account, though this may prevent us from providing parts of the service.
        </p>
      </LegalSection>

      <LegalSection id="sharing" heading="5. Who we share information with (Operators)">
        <p>
          We share personal information only with sub-processors (&ldquo;Operators&rdquo; under
          POPIA) who process it on our behalf under written agreements, and with people you choose:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Supabase</strong> — database, authentication, and file storage, hosted in the AWS Europe (London / <code>eu-west-2</code>) region, under a Data Processing Addendum.</li>
          <li><strong>Resend</strong> — delivery of transactional emails (caregiver invitations, data-export links).</li>
          <li><strong>Expo / Apple / Google</strong> — delivery of push notifications to your device.</li>
          <li><strong>Vercel</strong> — hosting of the VitaTrack web application.</li>
          <li><strong>Caregivers you invite</strong> — receive access to your health data at the role you select.</li>
        </ul>
        <p>
          We do not disclose your information to any other third party except where required by law
          or with your consent.
        </p>
      </LegalSection>

      <LegalSection id="cross-border" heading="6. Cross-border transfers">
        <p>
          Your health data is stored and processed outside South Africa, in the United Kingdom
          (the AWS Europe / London <code>eu-west-2</code> region), and some Operators (for email
          and push-notification delivery) may process limited data elsewhere. POPIA permits these
          transfers under <strong>section 72</strong>, and we rely on two independent bases for them:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Adequate protection.</strong> Our hosting and Operators are bound by written
            data-processing agreements and operate under the UK/EU GDPR, which provides a level of
            protection substantially similar to POPIA, including on onward transfers.
          </li>
          <li>
            <strong>Your explicit consent.</strong> When you create an account and add health data,
            you consent to this processing and to the cross-border transfer described here.
          </li>
        </ul>
        <p>
          There is no legal requirement under POPIA to store your data inside South Africa; what
          the law requires is the adequate protection described above, which we maintain.
        </p>
      </LegalSection>

      <LegalSection id="security" heading="7. How we protect your information">
        <p>We apply technical and organisational safeguards, including:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Row-Level Security on every database table, so you can only access your own records (and caregivers only what you shared).</li>
          <li>Encryption in transit (HTTPS/TLS) and at rest.</li>
          <li>Biometric app lock and secure on-device storage of session tokens.</li>
          <li>Audit logging of sensitive actions and least-privilege access for our systems.</li>
        </ul>
        <p>
          No system is perfectly secure. If a data breach affects your personal information, we will
          notify you and the Information Regulator as required by section 22 of POPIA.
        </p>
      </LegalSection>

      <LegalSection id="ice" heading="8. Emergency (ICE) profiles">
        <p>
          If you choose to publish an emergency profile, a limited subset of your information
          (such as name, blood type, allergies, key conditions, and emergency contacts) is made
          accessible to anyone with your ICE QR link, without logging in. This is by design, so
          first responders can help you in an emergency. You control whether an ICE profile is
          public and can disable it at any time. Do not share your ICE link publicly if you do not
          wish this information to be accessible.
        </p>
      </LegalSection>

      <LegalSection id="retention" heading="9. Data retention">
        <p>
          We keep your personal information for as long as your account is active. Archived
          medications and dose history are retained so your adherence records remain accurate. When
          you delete your account, we delete or de-identify your personal information within a
          reasonable period, except where we are required by law to retain certain records.
        </p>
      </LegalSection>

      <LegalSection id="your-rights" heading="10. Your rights under POPIA">
        <p>As a data subject you have the right to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Access</strong> the personal information we hold about you — use the in-app <em>Data Export</em> feature, which compiles your data into a downloadable file.</li>
          <li><strong>Correct or update</strong> your information from within the app.</li>
          <li><strong>Delete</strong> your information by deleting records or your account.</li>
          <li><strong>Object</strong> to processing, and <strong>withdraw consent</strong> for the processing of your health data.</li>
          <li><strong>Complain</strong> to the Information Regulator (details below).</li>
        </ul>
        <p>
          To exercise any right, contact our Information Officer at{' '}
          <a href="mailto:privacy@vitatrack.co.za" className="text-blue-600 underline">privacy@vitatrack.co.za</a>.
        </p>
      </LegalSection>

      <LegalSection id="children" heading="11. Children">
        <p>
          A parent or legal guardian may use VitaTrack to manage the health information of a child
          in their care. Where we process a child&rsquo;s information, we rely on the competent
          person&rsquo;s (guardian&rsquo;s) consent as required by section 34 of POPIA. We do not
          knowingly allow children to create their own accounts without such consent.
        </p>
      </LegalSection>

      <LegalSection id="changes" heading="12. Changes to this policy">
        <p>
          We may update this policy from time to time. Material changes will be communicated in the
          app or by email. The &ldquo;Last updated&rdquo; date above indicates the current version.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="13. Contact & the Information Regulator">
        <p>
          Questions or requests: <a href="mailto:privacy@vitatrack.co.za" className="text-blue-600 underline">privacy@vitatrack.co.za</a>.
        </p>
        <p>
          You have the right to lodge a complaint with the regulator:
        </p>
        <p className="rounded-lg bg-white p-4 text-sm ring-1 ring-gray-200">
          <strong>The Information Regulator (South Africa)</strong>
          <br />
          JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001
          <br />
          General enquiries:{' '}
          <a href="mailto:enquiries@inforegulator.org.za" className="text-blue-600 underline">enquiries@inforegulator.org.za</a>
          <br />
          POPIA complaints:{' '}
          <a href="mailto:POPIAComplaints@inforegulator.org.za" className="text-blue-600 underline">POPIAComplaints@inforegulator.org.za</a>
        </p>
      </LegalSection>
    </LegalShell>
  )
}

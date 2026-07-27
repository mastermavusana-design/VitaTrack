import type { Metadata } from 'next'
import { LegalShell, LegalSection } from '@/components/LegalShell'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms governing your use of the VitaTrack health-companion application.',
}

const LAST_UPDATED = '27 July 2026'

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the VitaTrack application and
        website (the &ldquo;Service&rdquo;), operated by <strong>[Registered Company Name]</strong>.
        By creating an account or using the Service you agree to these Terms. If you do not agree,
        do not use the Service.
      </p>

      <LegalSection id="not-medical-advice" heading="1. Not medical advice">
        <p>
          VitaTrack is a personal record-keeping and reminder tool. It is <strong>not</strong> a
          medical device and does <strong>not</strong> provide medical advice, diagnosis, or
          treatment. Blood-pressure, glucose, and other classifications shown in the app are
          general informational guides based on published guidelines and are not a substitute for
          professional medical judgement. Always consult a qualified healthcare provider about your
          health and before making any medical decision. In an emergency, contact your local
          emergency services immediately.
        </p>
      </LegalSection>

      <LegalSection id="eligibility" heading="2. Eligibility & accounts">
        <p>
          You must be able to form a binding contract to use the Service. You are responsible for
          keeping your login credentials secure and for all activity under your account. A parent or
          legal guardian may manage the health information of a person in their care in accordance
          with our Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection id="your-responsibilities" heading="3. Your responsibilities">
        <ul className="list-disc space-y-1 pl-6">
          <li>Provide accurate information and keep your medication and health records up to date.</li>
          <li>Do not rely solely on app reminders for critical medication — reminders depend on your device and notification settings.</li>
          <li>Only invite caregivers you trust; you control the access level you grant them.</li>
          <li>Do not misuse the Service, attempt to access other users&rsquo; data, or interfere with its security.</li>
        </ul>
      </LegalSection>

      <LegalSection id="caregivers" heading="4. Caregiver sharing">
        <p>
          When you invite a family member or caregiver, you authorise them to view, and (if you
          grant the dose-logger role) to log doses against, your account. You can revoke access at
          any time. We are not responsible for how invited caregivers use information you choose to
          share with them.
        </p>
      </LegalSection>

      <LegalSection id="ice" heading="5. Emergency (ICE) profiles">
        <p>
          If you enable a public emergency profile, information you include becomes accessible to
          anyone with the ICE link. You are responsible for deciding what to include and with whom
          to share the link. You can disable the public profile at any time.
        </p>
      </LegalSection>

      <LegalSection id="availability" heading="6. Availability & changes">
        <p>
          We aim to keep the Service available but do not guarantee uninterrupted operation. We may
          modify, suspend, or discontinue features, and we may update these Terms. Continued use
          after changes take effect constitutes acceptance of the updated Terms.
        </p>
      </LegalSection>

      <LegalSection id="disclaimer" heading="7. Disclaimer & limitation of liability">
        <p>
          To the maximum extent permitted by law, the Service is provided &ldquo;as is&rdquo;
          without warranties of any kind. We are not liable for any indirect, incidental, or
          consequential loss, or for any harm arising from reliance on the Service, missed
          reminders, or inaccuracies in data you or your caregivers enter. Nothing in these Terms
          excludes liability that cannot lawfully be excluded, including under the Consumer
          Protection Act, 2008.
        </p>
      </LegalSection>

      <LegalSection id="termination" heading="8. Termination">
        <p>
          You may stop using the Service and delete your account at any time. We may suspend or
          terminate access if you breach these Terms or misuse the Service. On termination, our
          Privacy Policy governs how your data is deleted or retained.
        </p>
      </LegalSection>

      <LegalSection id="law" heading="9. Governing law">
        <p>
          These Terms are governed by the laws of the Republic of South Africa, and you submit to
          the jurisdiction of its courts.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="10. Contact">
        <p>
          Questions about these Terms:{' '}
          <a href="mailto:support@vitatrack.co.za" className="text-blue-600 underline">support@vitatrack.co.za</a>.
          See our{' '}
          <a href="/privacy" className="text-blue-600 underline">Privacy Policy</a> for how we handle
          your information.
        </p>
      </LegalSection>
    </LegalShell>
  )
}

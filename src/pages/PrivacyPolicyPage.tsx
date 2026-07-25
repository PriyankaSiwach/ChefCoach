import { useNavigate } from "react-router-dom";
import { APP_NAME } from "@/lib/brand";

const LAST_UPDATED = "May 31, 2026";
const SUPPORT_EMAIL = "support.chefcoach@gmail.com";
const COMPANY = APP_NAME;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-playfair text-xl text-[var(--green)]">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--text)]">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="font-semibold text-[var(--text)]">{title}</h3>
      <div className="mt-1 space-y-2">{children}</div>
    </div>
  );
}

export function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <main className="page-safe min-h-screen bg-[var(--cream)]">
      <div className="mx-auto max-w-[720px]">
        {/* Back navigation */}
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-1.5 text-sm text-[var(--green)] hover:underline"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={16} height={16} aria-hidden>
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back
        </button>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--white)] p-8 shadow-sm">
          <h1 className="font-playfair text-3xl text-[var(--green)]">Privacy Policy</h1>
          <p className="mt-2 text-sm text-[var(--gray)]">
            Last updated: {LAST_UPDATED} &nbsp;·&nbsp; Effective immediately
          </p>

          <p className="mt-6 text-sm leading-relaxed text-[var(--text)]">
            {COMPANY} ("we", "us", or "our") operates the {APP_NAME} mobile application (the "App").
            This Privacy Policy explains what information we collect, how we use it, and your rights
            regarding your data. By using the App you agree to the practices described here.
          </p>

          {/* 1 */}
          <Section title="1. Information We Collect">
            <SubSection title="1.1 Account Information">
              <p>
                When you create an account or sign in with Apple or Google, we collect your{" "}
                <strong>email address</strong> and a secure authentication token. Passwords are
                hashed by our authentication provider (Supabase) and are never stored or transmitted
                in plain text.
              </p>
            </SubSection>

            <SubSection title="1.2 Profile &amp; Preference Data">
              <p>We store the preferences you choose inside the App, including:</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>Display name and avatar</li>
                <li>Dietary preferences (vegan, gluten-free, etc.) and food allergies</li>
                <li>Cuisine preferences and cooking-skill level</li>
                <li>Meal goals (weight loss, muscle gain, balanced nutrition, etc.)</li>
              </ul>
              <p>
                This data is stored on our servers (Supabase) and is linked to your account. It is
                used solely to personalise recipes and meal plans.
              </p>
            </SubSection>

            <SubSection title="1.3 Fridge Photos">
              <p>
                When you use the fridge-scan feature, you take or upload a photo. That image is
                sent securely to <strong>OpenAI</strong> for ingredient detection and is{" "}
                <strong>not retained</strong> by OpenAI beyond the single API call (per OpenAI's
                zero-data-retention policy for the vision endpoint). We do not permanently store
                your fridge photos on our servers.
              </p>
            </SubSection>

            <SubSection title="1.4 Usage Data">
              <p>
                We may collect anonymous usage metrics such as which features are used, session
                duration, and crash reports to improve the App. This data is not linked to your
                identity.
              </p>
            </SubSection>

            <SubSection title="1.5 Purchase &amp; Subscription Data">
              <p>
                Subscription purchases are processed entirely by Apple through In-App Purchase.
                {APP_NAME} does not collect or store credit-card numbers or billing details.
                Subscription status (active / expired) is managed by{" "}
                <strong>RevenueCat</strong> using an anonymous subscriber ID linked to your Apple
                ID.
              </p>
            </SubSection>
          </Section>

          {/* 2 */}
          <Section title="2. How We Use Your Information">
            <ul className="ml-4 list-disc space-y-2">
              <li>
                <strong>Provide the service</strong> — personalise recipes, generate meal plans, and
                sync your profile across devices.
              </li>
              <li>
                <strong>Authentication</strong> — verify your identity and keep your account secure.
              </li>
              <li>
                <strong>Subscription management</strong> — verify Pro entitlements and restore
                purchases.
              </li>
              <li>
                <strong>Service improvement</strong> — analyse aggregated, anonymised usage patterns
                to fix bugs and add features.
              </li>
              <li>
                <strong>Customer support</strong> — respond to enquiries you send to our support
                email.
              </li>
            </ul>
            <p>
              We do <strong>not</strong> sell, rent, or share your personal data with third parties
              for marketing purposes.
            </p>
          </Section>

          {/* 3 */}
          <Section title="3. Third-Party Services">
            <p>
              The App integrates the following third-party services. Each has its own privacy
              policy:
            </p>
            <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--gray-light)]">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Service</th>
                    <th className="px-4 py-2 text-left font-semibold">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {[
                    ["Supabase", "Authentication and profile storage"],
                    ["OpenAI", "Fridge photo ingredient detection and recipe generation"],
                    ["RevenueCat", "In-App Purchase subscription management"],
                    ["Apple Sign In", "Third-party authentication"],
                    ["Google Sign In", "Third-party authentication"],
                  ].map(([svc, purpose]) => (
                    <tr key={svc} className="bg-[var(--white)]">
                      <td className="px-4 py-2 font-medium">{svc}</td>
                      <td className="px-4 py-2 text-[var(--gray)]">{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* 4 */}
          <Section title="4. Data Retention">
            <p>
              We retain your account and profile data for as long as your account is active. If you
              delete your account (via "Reset account" in the Profile tab or by contacting us), we
              will permanently erase your profile data from our servers within 30 days.
            </p>
            <p>
              Aggregated, anonymised usage data may be retained indefinitely as it cannot be linked
              to any individual.
            </p>
          </Section>

          {/* 5 */}
          <Section title="5. Your Rights">
            <p>
              Depending on your jurisdiction you may have the following rights regarding your
              personal data:
            </p>
            <ul className="ml-4 list-disc space-y-2">
              <li>
                <strong>Access</strong> — request a copy of the data we hold about you.
              </li>
              <li>
                <strong>Correction</strong> — update inaccurate data via the Profile screen or by
                contacting us.
              </li>
              <li>
                <strong>Deletion</strong> — delete your account and all associated data. Use
                "Reset account" in the App or email us at{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-[var(--green)] underline underline-offset-2"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </li>
              <li>
                <strong>Portability</strong> — request your data in a machine-readable format.
              </li>
              <li>
                <strong>Objection / Restriction</strong> — object to or restrict certain processing
                activities.
              </li>
            </ul>
            <p>
              To exercise any of these rights, email{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-[var(--green)] underline underline-offset-2"
              >
                {SUPPORT_EMAIL}
              </a>
              . We will respond within 30 days.
            </p>
          </Section>

          {/* 6 */}
          <Section title="6. Children's Privacy">
            <p>
              {APP_NAME} is not directed at children under 13 years of age (or under 16 in the
              European Economic Area). We do not knowingly collect personal information from
              children. If you believe a child has provided us with personal data, please contact
              us at{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-[var(--green)] underline underline-offset-2"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              and we will delete it promptly.
            </p>
          </Section>

          {/* 7 */}
          <Section title="7. Data Security">
            <p>
              We use industry-standard security measures including TLS encryption in transit and
              AES-256 encryption at rest (via Supabase). Passwords are stored using
              bcrypt hashing and are never accessible to us in plain text. Despite these
              precautions, no internet transmission is 100% secure; use the App at your own risk.
            </p>
          </Section>

          {/* 8 */}
          <Section title="8. International Data Transfers">
            <p>
              Our servers are hosted by Supabase and may be located in the United States or other
              jurisdictions. If you are located in the European Economic Area, your data may be
              transferred to and processed in countries outside the EEA. We rely on
              Standard Contractual Clauses approved by the European Commission to safeguard such
              transfers.
            </p>
          </Section>

          {/* 9 */}
          <Section title="9. California Privacy Rights (CCPA)">
            <p>
              California residents have the right to know what personal information we collect,
              disclose, and sell. We do <strong>not sell</strong> personal information. You may
              request disclosure or deletion by emailing{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-[var(--green)] underline underline-offset-2"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </Section>

          {/* 10 */}
          <Section title="10. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When we do, we will update the
              "Last updated" date at the top of this page. Continued use of the App after changes
              are posted constitutes acceptance of the revised policy.
            </p>
          </Section>

          {/* 11 */}
          <Section title="11. Contact Us">
            <p>
              If you have questions about this Privacy Policy or your personal data, please contact
              us:
            </p>
            <address className="mt-2 not-italic">
              <strong>{COMPANY}</strong>
              <br />
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-[var(--green)] underline underline-offset-2"
              >
                {SUPPORT_EMAIL}
              </a>
            </address>
          </Section>
        </div>
      </div>
    </main>
  );
}

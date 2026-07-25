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

export function TermsOfServicePage() {
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
          <h1 className="font-playfair text-3xl text-[var(--green)]">Terms of Service</h1>
          <p className="mt-2 text-sm text-[var(--gray)]">
            Last updated: {LAST_UPDATED} &nbsp;·&nbsp; Effective immediately
          </p>

          <p className="mt-6 text-sm leading-relaxed text-[var(--text)]">
            Please read these Terms of Service ("Terms") carefully before using the{" "}
            {APP_NAME} mobile application (the "App") operated by {COMPANY} ("we", "us", or "our").
            By downloading, installing, or using the App you agree to be bound by these Terms.
            If you do not agree, do not use the App.
          </p>

          {/* 1 */}
          <Section title="1. Eligibility">
            <p>
              You must be at least 13 years old (or the minimum age of digital consent in your
              country) to use the App. By using the App you represent that you meet this
              requirement.
            </p>
          </Section>

          {/* 2 */}
          <Section title="2. Your Account">
            <p>
              You are responsible for maintaining the confidentiality of your login credentials and
              for all activities that occur under your account. Notify us immediately at{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-[var(--green)] underline underline-offset-2"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              if you suspect unauthorised access to your account.
            </p>
            <p>
              You may not share your account with others, create accounts by automated means, or
              create accounts under false pretences.
            </p>
          </Section>

          {/* 3 */}
          <Section title="3. Subscriptions and In-App Purchases">
            <p>
              {APP_NAME} offers a Pro subscription ("Pro") available through Apple In-App Purchase.
              By purchasing a subscription you agree to the following:
            </p>
            <ul className="ml-4 list-disc space-y-2">
              <li>
                <strong>Billing.</strong> Payment is charged to your Apple ID account at
                confirmation of purchase. Pricing is displayed before purchase and may vary by
                region.
              </li>
              <li>
                <strong>Auto-renewal.</strong> Subscriptions automatically renew at the end of each
                period unless cancelled at least 24 hours before the renewal date.
              </li>
              <li>
                <strong>Cancellation.</strong> You may cancel at any time via your Apple ID account
                settings or the App Store subscriptions page. Cancellation takes effect at the end
                of the current billing period; no partial refunds are issued.
              </li>
              <li>
                <strong>Free trials.</strong> If a free trial is offered, you will not be charged
                during the trial period. Your subscription begins automatically at the end of the
                trial unless cancelled before it ends.
              </li>
              <li>
                <strong>Refunds.</strong> All purchases are subject to Apple's refund policy.
                Refund requests must be directed to Apple, not to {COMPANY}.
              </li>
              <li>
                <strong>Price changes.</strong> We may change subscription prices. Any price change
                will be communicated in advance; continued use after the change constitutes
                acceptance.
              </li>
            </ul>
          </Section>

          {/* 4 */}
          <Section title="4. Acceptable Use">
            <p>You agree not to:</p>
            <ul className="ml-4 list-disc space-y-2">
              <li>Use the App for any unlawful purpose or in violation of any applicable laws.</li>
              <li>
                Attempt to reverse-engineer, decompile, or disassemble any part of the App.
              </li>
              <li>
                Upload photos or content that is illegal, defamatory, obscene, or infringes
                third-party rights.
              </li>
              <li>
                Circumvent or attempt to circumvent any subscription, paywall, or access control.
              </li>
              <li>
                Use automated scripts, bots, or crawlers to interact with the App.
              </li>
              <li>
                Interfere with or disrupt the integrity or performance of the App or its servers.
              </li>
            </ul>
          </Section>

          {/* 5 */}
          <Section title="5. User Content">
            <p>
              When you upload photos (e.g. fridge scans), you grant {COMPANY} a limited,
              non-exclusive, worldwide, royalty-free licence to process those photos solely for
              the purpose of providing the App's features (ingredient detection and recipe
              suggestions). We do not claim ownership of your photos; they are transmitted to
              OpenAI for processing and are not permanently stored by us.
            </p>
            <p>
              You represent and warrant that you own or have the necessary rights to any content
              you submit, and that it does not violate any third-party rights or applicable laws.
            </p>
          </Section>

          {/* 6 */}
          <Section title="6. Intellectual Property">
            <p>
              All content within the App — including but not limited to text, graphics, logos,
              icons, audio, and software — is the property of {COMPANY} or its content suppliers
              and is protected by applicable intellectual property laws. You may not reproduce,
              distribute, or create derivative works without our express written permission.
            </p>
          </Section>

          {/* 7 */}
          <Section title="7. Health &amp; Nutritional Disclaimer">
            <p>
              The recipes, nutritional estimates, meal plans, and dietary suggestions provided by
              the App are generated by artificial intelligence and are for informational purposes
              only. They are <strong>not</strong> a substitute for professional medical, dietary,
              or nutritional advice. Always consult a qualified healthcare provider before making
              significant changes to your diet, especially if you have a medical condition, food
              allergy, or other health concern.
            </p>
            <p>
              Nutritional values are approximate and may vary based on brands, preparation methods,
              and portion sizes. {COMPANY} makes no representations about the accuracy or
              completeness of nutritional information.
            </p>
          </Section>

          {/* 8 */}
          <Section title="8. Disclaimer of Warranties">
            <p>
              The App is provided on an "as is" and "as available" basis without warranties of any
              kind, either express or implied, including but not limited to implied warranties of
              merchantability, fitness for a particular purpose, and non-infringement. We do not
              warrant that the App will be uninterrupted, error-free, or free of viruses or other
              harmful components.
            </p>
          </Section>

          {/* 9 */}
          <Section title="9. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, {COMPANY} and its affiliates, officers,
              directors, employees, and agents shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, or any loss of profits or revenues,
              arising out of or in connection with your use of (or inability to use) the App,
              even if advised of the possibility of such damages.
            </p>
            <p>
              Our total cumulative liability to you for any claim arising from or related to these
              Terms or the App shall not exceed the greater of (a) the amount you paid us in the
              12 months preceding the claim, or (b) US$10.
            </p>
          </Section>

          {/* 10 */}
          <Section title="10. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless {COMPANY} and its affiliates from
              and against any claims, liabilities, damages, losses, and expenses (including
              reasonable legal fees) arising out of or in any way connected with your access to
              or use of the App, your violation of these Terms, or your infringement of any
              third-party right.
            </p>
          </Section>

          {/* 11 */}
          <Section title="11. Termination">
            <p>
              We reserve the right to suspend or terminate your access to the App at any time,
              with or without notice, for conduct that we believe violates these Terms or is
              harmful to other users, us, or third parties.
            </p>
            <p>
              You may delete your account at any time via the Profile tab. Upon account deletion,
              your profile data will be removed from our servers within 30 days.
            </p>
          </Section>

          {/* 12 */}
          <Section title="12. Third-Party Links and Services">
            <p>
              The App may contain links to third-party websites or services. We are not responsible
              for the content or privacy practices of those third parties. Their inclusion does not
              imply endorsement.
            </p>
          </Section>

          {/* 13 */}
          <Section title="13. Changes to These Terms">
            <p>
              We may revise these Terms at any time by posting an updated version with a new "Last
              updated" date. Continued use of the App after the revised Terms are posted
              constitutes your acceptance of the changes. If we make material changes we will
              notify you via the App or by email.
            </p>
          </Section>

          {/* 14 */}
          <Section title="14. Apple App Store Additional Terms">
            <p>
              If you downloaded the App from the Apple App Store, the following additional terms
              apply:
            </p>
            <ul className="ml-4 list-disc space-y-2">
              <li>
                These Terms are between you and {COMPANY} only, not with Apple Inc. Apple is not
                responsible for the App or its content.
              </li>
              <li>
                Apple has no obligation to provide maintenance or support services for the App.
              </li>
              <li>
                In the event of any failure of the App to conform to an applicable warranty, you
                may notify Apple and Apple will refund the purchase price (if any). To the maximum
                extent permitted by law, Apple will have no other warranty obligation.
              </li>
              <li>
                Apple is not responsible for addressing any product liability claims or third-party
                intellectual property infringement claims relating to the App.
              </li>
              <li>
                Apple and Apple's subsidiaries are third-party beneficiaries of these Terms and
                may enforce them against you.
              </li>
            </ul>
          </Section>

          {/* 15 */}
          <Section title="15. Governing Law">
            <p>
              These Terms are governed by and construed in accordance with the laws of the
              jurisdiction in which {COMPANY} is established, without regard to its conflict-of-law
              provisions. Any dispute arising from these Terms shall be resolved in the competent
              courts of that jurisdiction.
            </p>
          </Section>

          {/* 16 */}
          <Section title="16. Contact Us">
            <p>
              If you have any questions about these Terms, please contact us:
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

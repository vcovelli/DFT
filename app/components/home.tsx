import { displayPricing, type DurationKey } from "@/app/lib/pricing";
import { money, type Settings } from "@/lib/domain";
import OrderForm from "./order-form";
const durationLabels: Record<DurationKey, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};
export default function Home({ config }: { config: Settings }) {
  const pricing = displayPricing(config);
  return (
    <main>
      <nav className="site-nav" aria-label="Main navigation">
        <a className="wordmark" href="#top" aria-label="Done For Teachers home">
          <span className="wordmark-mark">DFT</span>
          <span>
            Done For
            <br />
            Teachers
          </span>
        </a>
        <div className="nav-links">
          <a href="#services">Services</a>
          <a href="#how-it-works">How it works</a>
          <a href="#faq">FAQ</a>
        </div>
        <a className="button button-small" href="#order">
          Start an order <span aria-hidden="true">↗</span>
        </a>
      </nav>
      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Teacher-created. Classroom-ready.</p>
          <h1>
            Your lessons.
            <br />
            <em>Done.</em>
          </h1>
          <p className="hero-lede">
            Thoughtful, state-aligned materials made for the way you actually
            teach, so you can spend your time on the parts of the job that
            matter most.
          </p>
          <div className="hero-actions">
            <a className="button" href="#order">
              Start an order <span aria-hidden="true">↗</span>
            </a>
            <a className="text-link" href="#services">
              Explore services <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="trust-row">
            <span className="trust-star">✳</span>
            <span>Grades 1–12</span>
            <span className="trust-divider" />
            <span>All subjects</span>
            <span className="trust-divider" />
            <span>{config.turnaroundHours}-hour preparation window</span>
          </div>
        </div>
        <div className="hero-note" aria-label="Service note">
          <span className="note-line" />
          <p>
            More time for
            <br />
            <strong>your students.</strong>
          </p>
          <span className="note-number">01</span>
        </div>
      </section>
      <section className="section how-section" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">A simpler school night</p>
          <h2>
            From blank page
            <br />
            <em>to ready to teach.</em>
          </h2>
        </div>
        <div className="steps">
          {[
            [
              "01",
              "Tell us what you need",
              "Share your subject, grade, topic, standards, and the way you like to teach.",
            ],
            [
              "02",
              "We make it yours",
              "A real teacher shapes the materials around your instructions, voice, and classroom.",
            ],
            [
              "03",
              "You get your time back",
              "We prepare your materials, request the balance, and email your completed order after payment.",
            ],
          ].map(([number, title, copy]) => (
            <article className="step" key={number}>
              <span className="step-number">{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section services-section" id="services">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow">Services & pricing</p>
            <h2>
              Pay for the
              <br />
              <em>time you need.</em>
            </h2>
          </div>
          <p className="section-intro">
            No bundles to decode. Choose a rhythm that fits your week, or ask us
            to build the whole unit.
          </p>
        </div>
        <div className="price-grid">
          {Object.entries(pricing)
            .filter(
              ([key]) =>
                key !== "rush" &&
                config.available.includes(
                  key as keyof typeof import("@/lib/domain").services,
                ),
            )
            .map(([key, item]) => (
              <article className="price-card" key={key}>
                <div>
                  <span className="card-kicker">
                    {key === "completeUnit"
                      ? "Best for a fresh start"
                      : key === "assessment"
                        ? "Standards support"
                        : "Made to order"}
                  </span>
                  <h3>{item.label}</h3>
                </div>
                {"options" in item ? (
                  <div className="price-options">
                    {Object.entries(item.options).map(([period, value]) => (
                      <div key={period}>
                        <span>{durationLabels[period as DurationKey]}</span>
                        <strong>{money(value)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flat-price">
                    <strong>{money(item.flat)}</strong>
                    <span>per unit</span>
                  </div>
                )}
                <a href="#order" className="card-link">
                  Choose this <span aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
        </div>
        <p className="pricing-footnote">
          Need it sooner? Rush service is available for an additional{" "}
          {money(pricing.rush.flat)}. Contact us about revision scope before
          ordering.
        </p>
      </section>
      <section className="why-band">
        <div className="why-mark">✳</div>
        <div>
          <p className="eyebrow">Why DFT</p>
          <h2>
            Made by someone
            <br />
            <em>who gets it.</em>
          </h2>
        </div>
        <div className="why-copy">
          <p>
            Done For Teachers was built around one simple truth: the best
            materials start with a teacher&apos;s intent.
          </p>
          <p>
            We bring 25 years of classroom experience and reported state and
            national board certification to every brief. The result is
            practical, intentional work that sounds like you.
          </p>
        </div>
      </section>
      <section className="section samples-section" id="samples">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow">A peek inside</p>
            <h2>
              Small details.
              <br />
              <em>Big difference.</em>
            </h2>
          </div>
          <p className="section-intro">
            A few illustrative examples of the kinds of materials we can shape
            around your classroom.
          </p>
        </div>
        <div className="sample-grid">
          <div className="sample-paper lesson-paper">
            <span className="paper-tag">
              Illustrative sample · Grade 5 Math
            </span>
            <h3>
              Fractions in
              <br />
              the real world
            </h3>
            <div className="paper-rule" />
            <p>
              Today we will connect equivalent fractions to recipes,
              measurements, and the choices we make every day.
            </p>
            <span className="paper-footer">Lesson plan · 01</span>
          </div>
          <div className="sample-paper ticket-paper">
            <span className="paper-tag">Illustrative sample · Exit ticket</span>
            <span className="ticket-asterisk">✳</span>
            <h3>Before you go...</h3>
            <p>
              Show two different ways to represent <strong>¾</strong>. Explain
              how you know they are equivalent.
            </p>
            <div className="answer-lines" />
            <span className="paper-footer">Reflection · 03</span>
          </div>
        </div>
      </section>
      <section className="order-section" id="order">
        <div className="order-intro">
          <p className="eyebrow">Start an order</p>
          <h2>
            Give us the
            <br />
            <em>good stuff.</em>
          </h2>
          <p>Tell us what is on your plate. We will take it from here.</p>
          <div className="order-aside">
            <span className="aside-number">02</span>
            <p>
              Secure deposit payment.
              <br />
              Materials are emailed after final payment.
            </p>
          </div>
        </div>
        <OrderForm config={config} />
      </section>
      <section className="section faq-section" id="faq">
        <div className="section-heading">
          <p className="eyebrow">Good to know</p>
          <h2>
            Questions,
            <br />
            <em>answered.</em>
          </h2>
        </div>
        <div className="faq-list">
          <details open>
            <summary>How quickly will I receive my materials?</summary>
            <p>
              {config.turnaroundMessage} Rush service, when available, costs{" "}
              {money(config.prices.rush)}.
            </p>
          </details>
          <details>
            <summary>What subjects and grade levels do you support?</summary>
            <p>
              Grades 1–12, including Math, English, Reading, Social Studies,
              Spelling, and Writing. If your subject is not listed, include it
              in the order form.
            </p>
          </details>
          <details>
            <summary>Can I request revisions?</summary>
            <p>
              Please contact us about the scope of revisions before ordering.
            </p>
          </details>
          <details>
            <summary>Do you accept payment or files through this site?</summary>
            <p>
              When orders are open, payments are collected through Stripe and
              optional PDF templates are stored privately. We email your
              materials after the balance is verified.
            </p>
          </details>
        </div>
      </section>
      <footer className="site-footer" id="contact">
        <div className="footer-top">
          <div>
            <a className="wordmark footer-wordmark" href="#top">
              <span className="wordmark-mark">DFT</span>
              <span>
                Done For
                <br />
                Teachers
              </span>
            </a>
            <p className="footer-tagline">
              Giving teachers
              <br />
              <em>their time back.</em>
            </p>
          </div>
          <div className="footer-contact">
            <p className="eyebrow">Have a question?</p>
            <a href="mailto:doneforteachers@gmail.com">
              doneforteachers@gmail.com <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Done For Teachers</span>
          <a href="/policies">Privacy & order terms</a>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </main>
  );
}

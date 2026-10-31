import {
  ArrowRight,
  Check,
  Code2,
  Download,
  Globe,
  Lock,
  MessageSquare,
  Package,
  Palette,
  ShieldCheck,
  Sparkles,
  Undo2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import logoSvg from "../../../docs/assets/logo.svg?raw";
import { COPY, LANGS, type Lang, RELEASES, REPO, WIKI } from "./copy";

const LANG_KEY = "aura-site.lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "uk") return saved;
  } catch {
    // No storage: follow the browser.
  }
  return navigator.language.toLowerCase().startsWith("uk") ? "uk" : "en";
}

type Os = "mac" | "windows" | "linux";

function detectOs(): Os {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  return "linux";
}

/** Aura's mark, drawn from the repository's own logo; `alive` lets its layers breathe. */
function Mark({ className = "", alive = false }: { className?: string; alive?: boolean }) {
  return (
    <span
      aria-hidden
      className={`mark ${alive ? "alive" : ""} ${className}`}
      // The repository's own logo file, not outside content.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the logo is our own SVG from docs/assets
      dangerouslySetInnerHTML={{ __html: logoSvg }}
    />
  );
}

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const c = COPY[lang];
  const os = detectOs();
  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Not kept: the browser's language decides next time.
    }
  }, [lang]);

  return (
    <div className="min-h-dvh">
      <header className="ink sticky top-0 z-30 border-b border-white/5 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
          <a href="#top" className="flex items-center gap-2.5 font-semibold text-white">
            <Mark className="size-8" />
            Aura
          </a>
          <div className="ml-auto hidden items-center gap-6 text-sm text-white/70 md:flex">
            <a href="#how" className="hover:text-white">
              {c.nav.how}
            </a>
            <a href="#features" className="hover:text-white">
              {c.nav.features}
            </a>
            <a href="#compare" className="hover:text-white">
              {c.nav.compare}
            </a>
            <a href="#next" className="hover:text-white">
              {c.nav.next}
            </a>
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <fieldset className="flex rounded-full bg-white/8 p-0.5 text-xs">
              <legend className="sr-only">Language</legend>
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  aria-pressed={lang === l.code}
                  onClick={() => setLang(l.code)}
                  className={`rounded-full px-2.5 py-1 transition-colors ${
                    lang === l.code
                      ? "bg-white text-[var(--ink)]"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  {l.code === "en" ? "EN" : "UA"}
                </button>
              ))}
            </fieldset>
            <a href="#get" className="btn btn-primary hidden sm:inline-flex">
              <Download className="size-4" /> {c.nav.download}
            </a>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="ink aura-rings relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-20 pb-24 lg:grid-cols-[1.1fr_1fr]">
            <div className="rise">
              <Mark
                alive
                className="mb-8 size-20 rounded-[26%] shadow-[0_0_80px_-10px_var(--layer-3)]"
              />
              <p className="mb-4 text-xs font-medium tracking-[0.18em] text-[var(--layer-4)] uppercase">
                {c.hero.kicker}
              </p>
              <h1 className="mb-6 text-4xl leading-[1.05] font-semibold tracking-tight text-white sm:text-6xl">
                {c.hero.title}
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-white/70">{c.hero.lead}</p>
              <div className="flex flex-wrap gap-3">
                <a href="#get" className="btn btn-primary btn-lg">
                  <Download className="size-5" /> {c.hero.download}
                </a>
                <a href={REPO} className="btn btn-ghost-dark btn-lg">
                  <Code2 className="size-5" /> {c.hero.github}
                </a>
              </div>
              <p className="mt-5 text-sm text-white/45">{c.hero.note}</p>
            </div>
            <ChatDemo lang={lang} />
          </div>
        </section>

        <section className="mx-auto -mt-14 max-w-6xl px-5">
          <img
            src="screen-app-light.png"
            alt={c.gallery.items[0]?.alt}
            className="rise w-full rounded-2xl border shadow-[var(--shadow-lg)]"
          />
        </section>

        <Section id="how" title={c.how.title}>
          <ol className="grid gap-5 md:grid-cols-3">
            {c.how.steps.map((step, i) => (
              <li key={step.title} className="card">
                <span className="step">{i + 1}</span>
                <h3 className="mt-4 mb-2 text-lg font-semibold">{step.title}</h3>
                <p className="text-[var(--muted-foreground)]">{step.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="gallery" title={c.gallery.title} tinted>
          <div className="grid gap-6 md:grid-cols-2">
            {c.gallery.items.slice(1).map((item) => (
              <figure key={item.src}>
                <img
                  src={item.src}
                  alt={item.alt}
                  loading="lazy"
                  className="w-full rounded-xl border shadow-[var(--shadow-md)]"
                />
                <figcaption className="mt-3 text-sm text-[var(--muted-foreground)]">
                  {item.caption}
                </figcaption>
              </figure>
            ))}
            <figure>
              <img
                src="screen-settings.png"
                alt="Settings"
                loading="lazy"
                className="w-full rounded-xl border shadow-[var(--shadow-md)]"
              />
              <figcaption className="mt-3 text-sm text-[var(--muted-foreground)]">
                {c.features.items[2]?.title}
              </figcaption>
            </figure>
          </div>
        </Section>

        <Section id="features" title={c.features.title}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {c.features.items.map((f, i) => {
              const Icon = [Package, Undo2, Sparkles, ShieldCheck, Palette, Globe][i] ?? Check;
              return (
                <div key={f.title} className="card">
                  <span className="icon-tile">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 mb-2 font-semibold">{f.title}</h3>
                  <p className="text-[var(--muted-foreground)]">{f.text}</p>
                </div>
              );
            })}
          </div>
        </Section>

        <Section id="compare" title={c.compare.title} lead={c.compare.lead} tinted>
          <div className="overflow-x-auto rounded-2xl border bg-[var(--card)] shadow-[var(--shadow-md)]">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-4" />
                  {c.compare.columns.map((col, i) => (
                    <th
                      key={col}
                      className={`p-4 text-center font-semibold ${i === 0 ? "text-[var(--primary)]" : ""}`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.compare.rows.map((row) => (
                  <tr key={row.label} className="border-b last:border-0">
                    <td className="p-4 font-medium">{row.label}</td>
                    {row.values.map((v, i) => (
                      <td
                        // biome-ignore lint/suspicious/noArrayIndexKey: columns are fixed
                        key={i}
                        className={`p-4 text-center ${i === 0 ? "bg-[var(--accent)] font-semibold text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <a
            href={`${REPO}/blob/HEAD/docs/COMPETITORS.md`}
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--primary)] hover:underline"
          >
            {c.compare.more} <ArrowRight className="size-4" />
          </a>
        </Section>

        <Section id="next" title={c.next.title} lead={c.next.lead}>
          <ol className="grid gap-5 md:grid-cols-3">
            {c.next.items.map((item, i) => (
              <li key={item.title} className="card">
                <span className="soon">{i + 1}</span>
                <h3 className="mt-4 mb-2 font-semibold">{item.title}</h3>
                <p className="text-[var(--muted-foreground)]">{item.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <section className="ink aura-rings relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <div className="mb-14 flex items-start gap-4">
              <span className="icon-tile icon-tile-dark">
                <Lock className="size-5" />
              </span>
              <div>
                <h2 className="mb-2 text-2xl font-semibold text-white">{c.privacy.title}</h2>
                <p className="max-w-2xl text-white/65">{c.privacy.text}</p>
              </div>
            </div>
            <div id="get" className="scroll-mt-24">
              <h2 className="mb-3 text-3xl font-semibold text-white sm:text-4xl">{c.get.title}</h2>
              <p className="mb-8 max-w-2xl text-white/65">{c.get.lead}</p>
              <div className="flex flex-wrap gap-3">
                {(["mac", "windows", "linux"] as const).map((o) => (
                  <a
                    key={o}
                    href={RELEASES}
                    className={`btn btn-lg ${o === os ? "btn-primary" : "btn-ghost-dark"}`}
                  >
                    <Download className="size-5" /> Aura {c.get.os[o]}
                  </a>
                ))}
              </div>
              <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/55">
                <a href={RELEASES} className="hover:text-white">
                  {c.get.other} →
                </a>
                <a href={`${REPO}#get-started`} className="hover:text-white">
                  {c.get.source} →
                </a>
              </p>
              <p className="mt-4 text-sm text-white/45">{c.get.ai}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="ink border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-5 py-8 text-sm text-white/55">
          <span className="flex items-center gap-2 text-white">
            <Mark className="size-6" /> Aura
          </span>
          <a href={WIKI} className="hover:text-white">
            {c.footer.docs}
          </a>
          <a href={REPO} className="hover:text-white">
            {c.footer.source}
          </a>
          <a href={`${REPO}/blob/HEAD/LICENSE`} className="ml-auto hover:text-white">
            {c.footer.license}
          </a>
        </div>
      </footer>
    </div>
  );
}

function Section({
  id,
  title,
  lead,
  tinted = false,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  tinted?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-16 ${tinted ? "bg-[var(--muted)]" : ""}`}>
      <div className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="mb-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        {lead && <p className="mb-10 max-w-3xl text-[var(--muted-foreground)]">{lead}</p>}
        {!lead && <div className="mb-10" />}
        {children}
      </div>
    </section>
  );
}

/** A short conversation that plays out: an app asked for, made, then changed with a yes. */
function ChatDemo({ lang }: { lang: Lang }) {
  const c = COPY[lang].chat;
  const [step, setStep] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: replay when the language changes
  useEffect(() => {
    setStep(0);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStep(5);
      return;
    }
    const timers = [600, 1700, 3000, 4100, 5200].map((ms, i) =>
      setTimeout(() => setStep(i + 1), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [lang]);
  return (
    <figure className="chat-demo m-0" aria-label="Aura">
      <div className="mb-4 flex items-center gap-2 border-b border-white/8 pb-3 text-sm text-white/70">
        <MessageSquare className="size-4 text-[var(--layer-4)]" /> Aura
      </div>
      <div className="flex min-h-[340px] flex-col gap-3">
        {step >= 1 && <Bubble mine>{c.ask1}</Bubble>}
        {step >= 2 && <Bubble name={c.helper}>{c.reply1}</Bubble>}
        {step >= 3 && <Bubble mine>{c.ask2}</Bubble>}
        {step >= 4 && <Bubble name={c.builder}>{c.reply2}</Bubble>}
        {step >= 5 && (
          <div className="pop rounded-2xl border border-[var(--layer-3)]/50 bg-white/5 p-4">
            <p className="mb-3 font-semibold text-white">{c.card}</p>
            <span className="btn btn-primary btn-sm">
              <Check className="size-4" /> {c.yes}
            </span>
          </div>
        )}
        {step < 5 && <span className="typing" aria-hidden />}
      </div>
    </figure>
  );
}

function Bubble({ mine, name, children }: { mine?: boolean; name?: string; children: ReactNode }) {
  if (mine) return <p className="pop bubble-mine">{children}</p>;
  return (
    <div className="pop flex gap-2.5">
      <Mark className="mt-0.5 size-7 shrink-0" />
      <div>
        <p className="mb-0.5 text-xs font-semibold text-white/80">{name}</p>
        <p className="text-[15px] leading-relaxed text-white/85">{children}</p>
      </div>
    </div>
  );
}

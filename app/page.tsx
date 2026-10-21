import type { Metadata } from "next";
import Link from "next/link";
import { AirIcon, ArrowForwardIcon, GlassIcon, RulerIcon } from "@/components/Icons";
import Compare from "@/components/landing/Compare";
import HeroPacking from "@/components/landing/HeroPacking";
import Proof from "@/components/landing/Proof";
import hero from "@/lib/landing/hero-order.json";
import { placementOrder } from "@/lib/ui/three";

export const metadata: Metadata = {
  title: { absolute: "رصّة: كل طلب في كرتونه الصحيح" },
  description:
    "رصّة تختار الكرتون الأوفر والآمن لكل طلب، وتريه للموظف بالصورة مع خطوات مكتوبة بالعربية. فلا تدفع شحنًا على هواء ولا يصل زجاج مكسور.",
};

const NAV = [
  { href: "/store", label: "المتجر" },
  { href: "/orders", label: "الطلبات" },
  { href: "/notifications", label: "الإشعارات" },
  { href: "/catalog", label: "المنتجات" },
  { href: "/monitoring", label: "الأداء" },
  { href: "/evaluation", label: "الدقة" },
];

const PROBLEMS = [
  {
    Icon: AirIcon,
    title: "شحن يُدفع على هواء",
    body: "شركات الشحن تحاسبك على حجم الكرتون لا على وزن ما فيه (الوزن الحجمي). كرتون أكبر من اللازم يعني فاتورة أعلى على كل طلب.",
  },
  {
    Icon: GlassIcon,
    title: "زجاج يُكسر وسوائل تنسكب",
    body: "علبة ثقيلة فوق زجاجة عطر، أو برطمان عسل مقلوب على جنبه. يصل الطلب تالفًا، فيعود مرتجعًا ويُعوَّض العميل.",
  },
  {
    Icon: RulerIcon,
    title: "مقاسات المنتجات غير مسجّلة",
    body: "أغلب المتاجر لا تكتب طول المنتج وعرضه وارتفاعه. فيُغلَّف الطلب بالتخمين، ولا تنفع أي أداة تشترط هذه الأرقام أولًا.",
  },
];

const ring = "focus-visible:outline-2 focus-visible:outline-offset-4";
const ringOnDeep = `${ring} focus-visible:outline-[var(--tape)]`;
const ringOnPaper = `${ring} focus-visible:outline-[var(--deep)] dark:focus-visible:outline-[var(--tape)]`;

export default function LandingPage() {
  const items = placementOrder(hero.items);
  const honey = hero.items.find((i) => i.liquid);

  return (
    <div className="landing flex min-h-full flex-col">
      {/* Hero: the product doing its one job, on a real order. */}
      <section className="relative overflow-hidden bg-[var(--deep)] text-[var(--on-deep)]">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <Link href="/" className={`font-display text-2xl font-bold text-[var(--on-deep)] ${ringOnDeep}`} aria-label="رصّة، الصفحة الرئيسية">
            رصّة
          </Link>
          <nav aria-label="أقسام التطبيق" className="flex items-center gap-6">
            <ul className="hidden gap-x-6 text-sm md:flex">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={`rounded text-[var(--on-deep-muted)] hover:text-[var(--on-deep)] ${ringOnDeep}`}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/orders"
              className={`rounded-lg border border-[var(--on-deep)]/35 px-4 py-2 text-sm font-bold text-[var(--on-deep)] hover:border-[var(--tape)] hover:text-[var(--tape)] ${ringOnDeep}`}
            >
              افتح الطلبات
            </Link>
          </nav>
        </header>

        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-[1.05fr_1fr] md:pb-24 md:pt-10">
          <div>
            <h1 className="font-display text-[clamp(3rem,8vw,6.25rem)] font-bold leading-[1.02] tracking-tight">
              <span className="block">كل طلب</span>
              <span className="block">في كرتونه</span>
              <span className="block">الصحيح.</span>
            </h1>
            <p className="mt-7 max-w-[34rem] text-lg leading-8 text-[var(--on-deep-muted)]">
              رصّة تختار الكرتون الأوفر والآمن لكل طلب، وتريه للموظف بالصورة ثلاثية الأبعاد مع خطوات مكتوبة بالعربية. فلا تدفع شحنًا
              على هواء، ولا يصل إلى عميلك زجاج مكسور.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href={`/orders/${hero.orderId}`}
                className={`rounded-lg bg-[var(--tape)] px-6 py-3.5 text-base font-bold text-[#12211e] shadow-[0_2px_0_#b8902f] transition-transform hover:-translate-y-0.5 ${ringOnDeep}`}
              >
                جهّز هذا الطلب بنفسك
              </Link>
              <a
                href="#proof"
                className={`rounded-lg px-2 py-3.5 text-base text-[var(--on-deep)] underline decoration-white/30 underline-offset-8 hover:decoration-[var(--tape)] ${ringOnDeep}`}
              >
                شاهد النتائج
              </a>
            </div>
          </div>

          <HeroPacking
            orderId={hero.orderId}
            cartonName={hero.carton.name}
            inner={hero.carton.innerCm as [number, number, number]}
            items={items}
            steps={hero.steps}
          />
        </div>
      </section>

      {/* Problem: three costs the shop pays today. Plain columns separated by rules, not cards. */}
      <section className="mx-auto w-full max-w-6xl px-5 py-20 md:py-28" aria-labelledby="problem-title">
        <h2 id="problem-title" className="max-w-4xl font-display text-[clamp(1.9rem,4.2vw,3.3rem)] font-medium leading-[1.35]">
          الكرتون الكبير تدفع شحنه هواءً، والصغير يكسر العطر.
        </h2>
        <ul className="mt-12 grid divide-y divide-[var(--rule)] border-y border-[var(--rule)] md:grid-cols-3 md:divide-y-0">
          {PROBLEMS.map(({ Icon, title, body }) => (
            <li key={title} className="py-7 md:border-s md:border-[var(--rule)] md:px-7 md:first:border-s-0 md:first:ps-0 md:last:pe-0">
              <Icon className="size-7 text-[var(--deep)] dark:text-[var(--tape)]" />
              <h3 className="mt-4 text-xl font-bold">{title}</h3>
              <p className="mt-2 leading-8 text-[var(--ink-2)]">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works: a real sequence, shown on one real order. */}
      <section className="border-y border-[var(--rule)] bg-[var(--panel)]" aria-labelledby="how">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <h2 id="how" className="font-display text-3xl font-bold md:text-4xl">
            كيف تعمل رصّة؟ ثلاث خطوات
          </h2>

          <ol className="mt-12 grid gap-12 md:grid-cols-3 md:gap-8">
            <Step n={1} title="يصل الطلب" text="يصل من متجرك، فتفتحه رصّة وتعرف ما فيه من منتجات.">
              <div className="rounded-lg bg-[var(--paper)] p-4">
                <p className="font-bold">
                  طلب <span className="ltr-nums">#{hero.orderId}</span>
                </p>
                <ul className="mt-2 space-y-2 text-sm leading-6">
                  {hero.items.map((it) => (
                    <li key={it.unitId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{it.name}</span>
                      {it.fragile && <span className="rounded bg-[#fef3c7] px-1.5 text-xs font-medium text-[#7a4304]">قابل للكسر</span>}
                      {it.liquid && <span className="rounded bg-[#dbeafe] px-1.5 text-xs font-medium text-[#1e3a8a]">سائل</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </Step>

            <Step n={2} title="تختار الكرتون" text="تقرأ المقاسات من صفحة المنتج إن لم تكن مسجّلة، ثم تختار أوفر كرتون آمن.">
              <div className="space-y-3 rounded-lg bg-[var(--paper)] p-4 text-sm leading-6">
                <blockquote className="text-[var(--ink-2)]">
                  «{honey?.name ?? "عسل سدر جبلي"}، معبأ في برطمان زجاجي محكم الإغلاق. أبعاد العبوة <span className="ltr-nums">9 × 9 × 13</span>{" "}
                  سم والوزن الإجمالي <span className="ltr-nums">850</span> جرام.»
                </blockquote>
                <p>
                  قرأت منها: <span className="ltr-nums font-bold">9 × 9 × 13</span> سم، <span className="ltr-nums font-bold">850</span> جرام، زجاج وسائل.
                </p>
                <p className="border-t border-[var(--rule)] pt-3">
                  الكرتون المختار: <strong>{hero.carton.name}</strong>، <span className="ltr-nums">{hero.carton.innerCm.join(" × ")}</span> سم.
                </p>
              </div>
            </Step>

            <Step n={3} title="الموظف يتبع الصورة والخطوات" text="يرى كل قطعة في مكانها، ويقرأ خطواتها بالعربية، ثم يضغط «تأكيد التغليف».">
              <div className="rounded-lg bg-[var(--paper)] p-4 text-sm leading-7">
                <p>{hero.steps[3]}</p>
                <ul className="mt-2 space-y-1 text-[var(--ink-2)]">
                  <li>لُفّه بغلاف فقاعي لا تقل سماكته عن 1.5 سم، ولا تضع فوقه أي شيء.</li>
                  <li>أبقِه واقفًا ولا تقلبه على جنبه.</li>
                </ul>
              </div>
            </Step>
          </ol>
        </div>
      </section>

      <Proof />
      <Compare />

      {/* Final call to action. */}
      <section className="mx-4 mb-16 overflow-hidden rounded-2xl bg-[var(--deep)] text-[var(--on-deep)] md:mx-auto md:w-full md:max-w-6xl" aria-labelledby="cta-title">
        <div className="flex flex-col items-start justify-between gap-8 px-6 py-12 md:flex-row md:items-center md:px-12 md:py-16">
          <div>
            <h2 id="cta-title" className="font-display text-[clamp(1.8rem,4vw,2.8rem)] font-bold leading-tight">
              جرّبها على طلباتك.
            </h2>
            <p className="mt-3 max-w-lg leading-8 text-[var(--on-deep-muted)]">اطلب من المتجر، ثم افتح الطلب في لوحة الطلبات وشاهد رصّة تجهّزه خلال لحظات.</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-4">
            <Link
              href="/store"
              className={`inline-flex items-center gap-2 rounded-lg bg-[var(--tape)] px-7 py-4 text-lg font-bold text-[#12211e] shadow-[0_2px_0_#b8902f] transition-transform hover:-translate-y-0.5 ${ringOnDeep}`}
            >
              اطلب من المتجر
              <ArrowForwardIcon className="size-5" />
            </Link>
            <Link href="/orders" className={`rounded text-[var(--on-deep)] underline underline-offset-8 ${ringOnDeep}`}>
              افتح الطلبات
            </Link>
          </div>
        </div>
      </section>

      <footer className="mt-auto border-t border-[var(--rule)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-8 text-sm text-[var(--ink-3)]">
          <p className="max-w-md leading-7">
            <span className="font-display text-base font-bold text-[var(--ink)]">رصّة</span>، الكرتون الصحيح لكل طلب.
          </p>
          <nav aria-label="روابط التذييل">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={`rounded underline-offset-4 hover:text-[var(--ink)] hover:underline ${ringOnPaper}`}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, text, children }: { n: number; title: string; text: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="ltr-nums grid size-9 shrink-0 place-items-center rounded-full bg-[var(--deep)] font-bold text-[var(--on-deep)]">{n}</span>
        <h3 className="text-xl font-bold">{title}</h3>
      </div>
      <p className="leading-7 text-[var(--ink-2)]">{text}</p>
      {children}
    </li>
  );
}

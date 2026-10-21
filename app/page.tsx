import type { Metadata } from "next";
import Link from "next/link";
import HeroPacking from "@/components/landing/HeroPacking";
import hero from "@/lib/landing/hero-order.json";
import { placementOrder } from "@/lib/ui/three";

export const metadata: Metadata = {
  title: { absolute: "رصّة: كل طلب في كرتونه الصحيح" },
  description:
    "رصّة يقرأ صفحات منتجاتك، يعرف المقاس والوزن وما ينكسر وما ينسكب، ثم يختار الكرتون ويرتّب القطع خطوة بخطوة.",
};

const NAV = [
  { href: "/orders", label: "الطلبات" },
  { href: "/notifications", label: "الإشعارات" },
  { href: "/catalog", label: "المنتجات" },
  { href: "/monitoring", label: "الأداء" },
  { href: "/evaluation", label: "الدقة" },
];

// Every number below comes from eval/results/*.json via docs/report/results.md (2026-10-21). Don't type new ones by hand.
const MEASURED = [
  { value: "40 / 40", label: "ترتيب اقترحه المحرّك واجتاز المدقّق المستقل" },
  { value: "20 / 20", label: "حالة تعبئة محكمة بلا فراغ، وجد لها المحرّك الحل" },
  { value: "0 / 20", label: "مرة ادّعى فيها أن طلبًا مستحيلًا يدخل الكرتون" },
  { value: "100%", label: "من المنتجات بلا مقاسات قال عنها «غير معروف» بدل أن يخمّن" },
  { value: "12.9%", label: "متوسط خطأ المقاسات التي يستنتجها من القرائن، ونضيف هامش 15% فوقها" },
  { value: "1.8", label: "ثانية في المتوسط لقراءة صفحة منتج واحدة، بتكلفة أقل من خُمس هللة" },
];

const RULES = [
  { swatch: "bg-fragile", title: "القابل للكسر لا يُوضع فوقه شيء", body: "ويُلفّ بغلاف فقاعي لا تقل سماكته عن 1.5 سم." },
  { swatch: "bg-liquid", title: "السائل يبقى واقفًا", body: "فلا يُقلب على جنبه مهما وفّر ذلك من مساحة." },
  { swatch: "bg-sensitive", title: "الحساس يأخذ حشوة من كل الجهات", body: "مثل الشواحن والإلكترونيات الصغيرة." },
  { swatch: "estimated", title: "المقاس التقديري موسوم", body: "ويطلب من الموظف التأكد من أنه يدخل قبل الإغلاق." },
  { swatch: "none", title: "إذا لم يعرف المقاس، يطلب قياسه", body: "ولا يقترح كرتونًا مبنيًا على تخمين." },
];

export default function LandingPage() {
  const items = placementOrder(hero.items);

  return (
    <div className="landing flex min-h-full flex-col">
      {/* Hero: the product doing its one job, on a real order. */}
      <section className="relative overflow-hidden bg-[var(--deep)] text-[var(--on-deep)]">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-5">
          <Link href="/" className="font-display text-2xl font-bold text-[var(--on-deep)]" aria-label="رصّة، الصفحة الرئيسية">
            رصّة
          </Link>
          <nav aria-label="أقسام التطبيق">
            <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="rounded text-[var(--on-deep-muted)] hover:text-[var(--on-deep)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tape)]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
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
              رصّة يقرأ صفحات منتجاتك، فيعرف المقاس والوزن وما ينكسر وما ينسكب. ثم يختار أوفر كرتون آمن، ويرتّب القطع
              للموظف خطوة بخطوة.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href={`/orders/${hero.orderId}`}
                className="rounded-lg bg-[var(--tape)] px-6 py-3.5 text-base font-bold text-[var(--ink)] shadow-[0_2px_0_#b8902f] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tape)]"
              >
                جهّز هذا الطلب بنفسك
              </Link>
              <Link
                href="/evaluation"
                className="rounded-lg px-2 py-3.5 text-base text-[var(--on-deep)] underline decoration-white/30 underline-offset-8 hover:decoration-[var(--tape)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tape)]"
              >
                كيف قسنا دقّته
              </Link>
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

      {/* The problem, said once. */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <p className="max-w-4xl font-display text-[clamp(1.9rem,4.2vw,3.3rem)] font-medium leading-[1.35]">
          الكرتون الكبير تدفع شحنه هواءً، والصغير يكسر العطر.
        </p>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-[color-mix(in_oklab,var(--ink)_70%,transparent)]">
          موظف التغليف يقرّر في ثوانٍ وبالنظر، وصفحة المنتج التي فيها المقاس والوزن مفتوحة في مكان آخر. رصّة يجمع
          الاثنين: يقرأ الصفحة مرة واحدة، ويحفظ ما عرفه، ويقترح الكرتون والترتيب لكل طلب بعدها.
        </p>
      </section>

      {/* How it works: a real sequence, shown on one real product. */}
      <section className="border-y border-[color-mix(in_oklab,var(--ink)_12%,transparent)] bg-white" aria-labelledby="how">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
          <h2 id="how" className="font-display text-3xl font-bold md:text-4xl">
            من صفحة المنتج إلى الكرتون
          </h2>
          <p className="mt-3 max-w-2xl text-[color-mix(in_oklab,var(--ink)_70%,transparent)]">
            هذا ما حدث فعلًا لعلبة العسل في الطلب أعلاه.
          </p>

          <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            <Step n={1} title="يقرأ صفحة المنتج">
              <blockquote className="rounded-lg bg-[var(--paper)] p-4 leading-7">
                عسل سدر جبلي أصلي من جبال الجنوب، معبأ في برطمان زجاجي محكم الإغلاق. أبعاد العبوة ٩ × ٩ × ١٣ سم والوزن
                الإجمالي ٨٥٠ جرام.
              </blockquote>
            </Step>
            <Step n={2} title="يستخرج ما يهم التغليف">
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 rounded-lg bg-[var(--paper)] p-4">
                <dt className="text-[color-mix(in_oklab,var(--ink)_60%,transparent)]">المقاس</dt>
                <dd>
                  <span className="ltr-nums">9 × 9 × 13</span> سم، من الصفحة
                </dd>
                <dt className="text-[color-mix(in_oklab,var(--ink)_60%,transparent)]">الوزن</dt>
                <dd>
                  <span className="ltr-nums">850</span> جرام، من الصفحة
                </dd>
                <dt className="text-[color-mix(in_oklab,var(--ink)_60%,transparent)]">تنبيهات</dt>
                <dd className="flex flex-wrap gap-1.5">
                  <span className="rounded bg-[#fef3c7] px-2 text-[#7a4304]">زجاج، قابل للكسر</span>
                  <span className="rounded bg-[#dbeafe] px-2 text-[#1e3a8a]">سائل</span>
                </dd>
              </dl>
            </Step>
            <Step n={3} title="يختار الكرتون ويكتب التعليمات">
              <div className="rounded-lg bg-[var(--paper)] p-4 leading-7">
                <p>ضع «عسل سدر جبلي 500 جرام» في قاع الكرتون.</p>
                <ul className="mt-2 space-y-1 text-[color-mix(in_oklab,var(--ink)_75%,transparent)]">
                  <li>لُفّه بغلاف فقاعي لا تقل سماكته عن 1.5 سم، ولا تضع فوقه أي شيء.</li>
                  <li>أبقِه واقفًا ولا تقلبه على جنبه، ويكون غطاؤه إلى الأعلى.</li>
                </ul>
              </div>
            </Step>
          </ol>
        </div>
      </section>

      {/* Rules the engine checks on every layout, using the same colours as the app. */}
      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-[1fr_1.4fr] md:py-28" aria-labelledby="rules">
        <div>
          <h2 id="rules" className="font-display text-3xl font-bold md:text-4xl">
            قواعد لا يتنازل عنها
          </h2>
          <p className="mt-4 max-w-md leading-8 text-[color-mix(in_oklab,var(--ink)_70%,transparent)]">
            كل ترتيب يقترحه المحرّك يمرّ على مدقّق مستقل لا يعتمد على كود المحرّك. إذا خالف قاعدة واحدة، لا يظهر للموظف.
          </p>
        </div>
        <ul className="divide-y divide-[color-mix(in_oklab,var(--ink)_12%,transparent)] border-y border-[color-mix(in_oklab,var(--ink)_12%,transparent)]">
          {RULES.map((r) => (
            <li key={r.title} className="flex gap-4 py-5">
              <RuleSwatch kind={r.swatch} />
              <div>
                <p className="font-bold">{r.title}</p>
                <p className="mt-1 text-[color-mix(in_oklab,var(--ink)_70%,transparent)]">{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Measured results, set as a shipping label. */}
      <section className="bg-[var(--deep)] text-[var(--on-deep)]" aria-labelledby="measured">
        <div className="mx-auto grid max-w-6xl items-start gap-12 px-5 py-20 md:grid-cols-[1fr_1.25fr] md:py-28">
          <div>
            <h2 id="measured" className="font-display text-3xl font-bold md:text-4xl">
              قسناه قبل أن نقول
            </h2>
            <p className="mt-4 max-w-md leading-8 text-[var(--on-deep-muted)]">
              اختبرنا القراءة على 30 منتجًا، والمحرّك على 60 حالة تعبئة، منها 20 مستحيلة عمدًا. الأرقام كما خرجت، بما فيها
              ما لم يعجبنا.
            </p>
            <Link
              href="/evaluation"
              className="mt-6 inline-block rounded text-[var(--tape)] underline underline-offset-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tape)]"
            >
              صفحة الدقة الكاملة
            </Link>
          </div>

          <ShippingLabel />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 text-center md:py-24">
        <p className="font-display text-[clamp(1.8rem,4vw,2.8rem)] font-bold">جرّبها على طلب من المتجر التجريبي.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/orders"
            className="rounded-lg bg-[var(--deep)] px-6 py-3.5 font-bold text-[var(--on-deep)] hover:bg-[var(--deep-2)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--deep)]"
          >
            افتح الطلبات
          </Link>
          <Link
            href="/monitoring"
            className="rounded-lg border border-[color-mix(in_oklab,var(--ink)_20%,transparent)] px-6 py-3.5 font-bold hover:border-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--deep)]"
          >
            شاهد أداء رصّة
          </Link>
        </div>
      </section>

      <footer className="mt-auto border-t border-[color-mix(in_oklab,var(--ink)_12%,transparent)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-[color-mix(in_oklab,var(--ink)_65%,transparent)]">
          <p>
            <span className="font-display text-base font-bold text-[var(--ink)]">رصّة</span>، مشروع فريق من ثلاثة طلاب. البيانات
            اصطناعية، ولم نجرّبه بعد مع متجر حقيقي.
          </p>
          <a
            href="https://github.com/justAbdulaziz10/Rassah"
            className="rounded underline underline-offset-4 hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--deep)]"
          >
            الكود على GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="ltr-nums grid size-9 place-items-center rounded-full bg-[var(--deep)] font-bold text-[var(--on-deep)]">
          {n}
        </span>
        <h3 className="text-lg font-bold">{title}</h3>
      </div>
      {children}
    </li>
  );
}

function RuleSwatch({ kind }: { kind: string }) {
  if (kind === "estimated")
    return <span className="mt-1 size-5 shrink-0 rounded border-2 border-dashed border-[var(--ink)]" aria-hidden />;
  if (kind === "none")
    return (
      <span className="mt-1 grid size-5 shrink-0 place-items-center rounded border-2 border-[var(--ink)] text-xs font-bold" aria-hidden>
        ?
      </span>
    );
  return <span className={`mt-1 size-5 shrink-0 rounded ${kind}`} aria-hidden />;
}

/** The results as a parcel label: the one object everyone in shipping reads every day. */
function ShippingLabel() {
  return (
    <div className="rotate-[-1.2deg] rounded-md bg-white p-1.5 text-[var(--ink)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] motion-reduce:rotate-0">
      <div className="rounded-sm border-[3px] border-[var(--ink)]">
        <div className="flex items-center justify-between gap-4 border-b-[3px] border-[var(--ink)] px-4 py-3">
          <p className="font-display text-xl font-bold">نتائج التقييم</p>
          <p className="text-sm">
            <span className="ltr-nums">2026-10-21</span>
          </p>
        </div>
        <dl>
          {MEASURED.map((m) => (
            <div
              key={m.label}
              className="grid grid-cols-[6.5rem_1fr] items-baseline gap-4 border-b border-[color-mix(in_oklab,var(--ink)_25%,transparent)] px-4 py-3 last:border-b-0"
            >
              <dt className="ltr-nums text-end font-display text-2xl font-bold">{m.value}</dt>
              <dd className="text-sm leading-6">{m.label}</dd>
            </div>
          ))}
        </dl>
        {/* barcode strip: decorative, from the label idiom */}
        <div
          className="h-12 border-t-[3px] border-[var(--ink)] bg-[repeating-linear-gradient(90deg,var(--ink)_0_2px,transparent_2px_5px,var(--ink)_5px_6px,transparent_6px_9px,var(--ink)_9px_12px,transparent_12px_14px)] opacity-90"
          aria-hidden
        />
      </div>
    </div>
  );
}

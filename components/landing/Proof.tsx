import Link from "next/link";

// Numbers: 258 feasible test orders + 20 impossible ones set by the team, benchmark of 2026-10-21 re-run after the engine began splitting
// orders over several cartons (coordinator figures). Do not type new ones by hand: re-run `npm run bench` and copy from the report.

function Bar({ label, value, tone }: { label: string; value: number; tone: "rassah" | "plain" }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-[5.5rem] shrink-0 text-[13px] leading-5 text-[#3d4e4a]">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-sm bg-[#e3eae7]" aria-hidden>
        <div
          className={`bar-grow h-full rounded-sm ${tone === "rassah" ? "bg-[#0b3b36]" : "bg-[#9aa8a4]"}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="ltr-nums w-14 shrink-0 text-end font-bold">{value}%</span>
    </div>
  );
}

function Row({ big, unit, title, children }: { big: string; unit?: string; title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-start gap-x-4 gap-y-1 border-b border-[#12211e]/20 px-4 py-4 last:border-b-0 sm:grid-cols-[7.5rem_1fr]">
      <dt className="text-right">
        <span className="ltr-nums block text-right font-display text-[1.7rem] font-bold leading-none sm:text-[2rem]">{big}</span>
        {unit && <span className="mt-1 block text-xs text-[#3d4e4a]">{unit}</span>}
      </dt>
      <dd>
        <p className="font-bold leading-6">{title}</p>
        <div className="mt-1.5 text-sm leading-6 text-[#3d4e4a]">{children}</div>
      </dd>
    </div>
  );
}

export default function Proof() {
  return (
    <section id="proof" className="scroll-mt-4 bg-[var(--deep)] text-[var(--on-deep)]" aria-labelledby="proof-title">
      <div className="mx-auto grid max-w-6xl items-start gap-12 px-5 py-20 md:grid-cols-[1fr_1.35fr] md:py-28">
        <div>
          <h2 id="proof-title" className="font-display text-3xl font-bold leading-tight md:text-4xl">
            قسناها قبل أن نقول
          </h2>
          <p className="mt-5 max-w-md text-lg leading-8 text-[var(--on-deep-muted)]">
            جرّبنا رصّة على <span className="ltr-nums text-[var(--on-deep)]">258</span> طلبًا، وقارنّاها بتعبئة بلا قواعد: تُوضع
            القطع في أي مكان يتّسع لها.
          </p>
          <Link
            href="/evaluation"
            className="mt-6 inline-block rounded text-[var(--tape)] underline underline-offset-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--tape)]"
          >
            تفاصيل الاختبار
          </Link>
        </div>

        <div className="parcel-label rotate-[-1deg] rounded-md p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] motion-reduce:rotate-0">
          <div className="rounded-sm border-[3px] border-[#12211e]">
            <div className="flex items-center justify-between gap-4 border-b-[3px] border-[#12211e] px-4 py-3">
              <p className="font-display text-xl font-bold">نتائج الاختبار</p>
              <p className="text-sm">
                <span className="ltr-nums">2026-10-21</span>
              </p>
            </div>
            <dl>
              <Row big="100%" title="ترتيبات صحيحة تلتزم بكل القواعد">
                <div className="mt-2 space-y-1.5 text-[#12211e]">
                  <Bar label="رصّة" value={100} tone="rassah" />
                  <Bar label="بلا قواعد" value={32.6} tone="plain" />
                </div>
              </Row>
              <Row big="8.3%" unit="أقل" title="تكلفة أقل لكل طلب">
                في الطلبات التي نجحت فيها الطريقتان، شاملةً ثمن الكرتون وشحن الوزن الحجمي.
              </Row>
              <Row big="0 / 20" title="مرات قالت فيها «يدخل الكرتون» وهو لا يدخل">
                جرّبناها على <span className="ltr-nums">20</span> طلبًا لا يتّسع لها كرتون واحد عمدًا. لم تدّعِ في أي منها أنه يدخل، وقسّمت{" "}
                <span className="ltr-nums">7</span> منها على عدة كراتين، كل كرتون منها مفحوص.
              </Row>
              <Row big="81" unit="ملّي ثانية" title="أقل من عُشر ثانية لتجهيز الطلب">
                هذا الزمن يكفي لـ <span className="ltr-nums">95%</span> من الطلبات، فلا ينتظر الموظف أمام الشاشة.
              </Row>
            </dl>
            <div
              className="h-10 border-t-[3px] border-[#12211e] bg-[repeating-linear-gradient(90deg,#12211e_0_2px,transparent_2px_5px,#12211e_5px_6px,transparent_6px_9px,#12211e_9px_12px,transparent_12px_14px)] opacity-90"
              aria-hidden
            />
          </div>
        </div>
      </div>
    </section>
  );
}

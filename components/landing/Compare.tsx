import { CheckIcon, CrossIcon, MinusIcon } from "@/components/Icons";

type Mark = "yes" | "partial" | "no";

interface Row {
  title: string;
  detail: string;
  rassah: { mark: Mark; text: string };
  generic: { mark: Mark; text: string };
}

// "Generic tools" is a category, not a named product. "Partial" means: it varies from tool to tool.
const ROWS: Row[] = [
  {
    title: "السوائل تبقى واقفة",
    detail: "لا يُقلب العطر أو العسل على جنبه ليوفّر مساحة.",
    rassah: { mark: "yes", text: "دائمًا" },
    generic: { mark: "partial", text: "جزئيًا" },
  },
  {
    title: "لا شيء فوق القابل للكسر",
    detail: "ويُلفّ بغلاف فقاعي لا تقل سماكته عن 1.5 سم.",
    rassah: { mark: "yes", text: "دائمًا" },
    generic: { mark: "partial", text: "جزئيًا" },
  },
  {
    title: "كل قطعة لها ما يسندها",
    detail: "لا قطعة معلّقة في الهواء داخل الكرتون.",
    rassah: { mark: "yes", text: "دائمًا" },
    generic: { mark: "partial", text: "جزئيًا" },
  },
  {
    title: "تعمل والمتجر بلا مقاسات",
    detail: "تقرأ المقاس من صفحة المنتج، أو تطلب قياسًا واحدًا.",
    rassah: { mark: "yes", text: "نعم" },
    generic: { mark: "no", text: "تُدخل المقاسات أولًا" },
  },
  {
    title: "خطوات مكتوبة بالعربية للموظف",
    detail: "جمل قصيرة يفهمها من يغلّف، بدل رسم يحتاج تفسيرًا.",
    rassah: { mark: "yes", text: "نعم" },
    generic: { mark: "no", text: "لا" },
  },
  {
    title: "يقسّم الطلب على أكثر من كرتون عند الحاجة",
    detail: "وكل كرتون مفحوص قبل أن يراه الموظف.",
    rassah: { mark: "yes", text: "نعم" },
    generic: { mark: "yes", text: "نعم، دون فحص كامل للقواعد" },
  },
  {
    title: "كل ترتيب يُفحص قبل أن يظهر",
    detail: "فاحص مستقل يرفض أي ترتيب يخالف قاعدة.",
    rassah: { mark: "yes", text: "نعم" },
    generic: { mark: "no", text: "لا" },
  },
];

const MARK_STYLE: Record<Mark, string> = {
  yes: "bg-[var(--deep)] text-[var(--on-deep)]",
  partial: "border-2 border-[var(--ink-3)] text-[var(--ink-3)]",
  no: "border-2 border-[var(--bad-ink)] text-[var(--bad-ink)]",
};

function Cell({ mark, text, strong }: { mark: Mark; text: string; strong?: boolean }) {
  const Icon = mark === "yes" ? CheckIcon : mark === "partial" ? MinusIcon : CrossIcon;
  return (
    <span className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:justify-center sm:gap-2.5">
      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-sm ${MARK_STYLE[mark]}`}>
        <Icon />
      </span>
      <span className={`text-xs leading-4 sm:text-sm sm:leading-5 ${strong ? "font-bold" : "text-[var(--ink-2)]"}`}>{text}</span>
    </span>
  );
}

export default function Compare() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-20 md:py-28" aria-labelledby="compare-title">
      <h2 id="compare-title" className="font-display text-3xl font-bold leading-tight md:text-4xl">
        لماذا رصّة وليست أداة تعبئة عامة؟
      </h2>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--ink-2)]">
        أدوات التعبئة العامة تحسب أين تتّسع الصناديق. رصّة تعرف أن العسل زجاج، وأن العطر لا يُحمل عليه شيء.
      </p>

      <div className="table-scroll mt-10 rounded-xl border border-[var(--rule)] bg-[var(--panel)]">
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">مقارنة بين رصّة وأدوات التعبئة العامة</caption>
          <thead>
            <tr className="border-b border-[var(--rule)] text-sm">
              <th scope="col" className="px-4 py-4 text-start font-medium text-[var(--ink-3)] sm:px-6">
                ما تحتاجه عند التغليف
              </th>
              <th scope="col" className="w-[4.75rem] bg-[color-mix(in_oklab,var(--deep)_9%,transparent)] px-1 py-4 sm:px-2 text-center font-display text-lg font-bold sm:w-48">
                رصّة
              </th>
              <th scope="col" className="w-[5.25rem] px-1 py-4 text-center text-xs font-medium sm:px-2 sm:text-sm text-[var(--ink-2)] sm:w-48">
                أدوات التعبئة العامة
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.title} className="border-b border-[var(--rule)] last:border-b-0">
                <th scope="row" className="px-4 py-4 text-start align-middle font-normal sm:px-6">
                  <span className="block font-bold leading-6">{r.title}</span>
                  <span className="mt-0.5 block text-sm leading-6 text-[var(--ink-2)]">{r.detail}</span>
                </th>
                <td className="bg-[color-mix(in_oklab,var(--deep)_9%,transparent)] px-1 py-4 align-middle sm:px-2">
                  <Cell {...r.rassah} strong />
                </td>
                <td className="px-1 py-4 align-middle sm:px-2">
                  <Cell {...r.generic} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

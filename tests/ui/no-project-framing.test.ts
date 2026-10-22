import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The MVP / two-day / Tuwaiq / synthetic-data framing belongs in the English README on GitHub only.
// It was put on the site and removed twice (59a7611, f0435b7). The site links to the repo from its footer instead.
const ROOT = join(__dirname, "../..");
const SITE_DIRS = ["app", "components", "lib"];

const BANNED: [RegExp, string][] = [
  [/\bMVP\b/, "MVP"],
  [/طويق|Tuwaiq/i, "Tuwaiq Academy"],
  [/نسخة (أولية|تجريبية)/, "first/trial version"],
  [/في يومين|two[- ]day/i, "built in two days"],
  [/(بيانات|البيانات|بياناتها)\s+(تجريبية|اصطناعية|وهمية)/, "demo/synthetic data"],
  [/(ثلاثة|فريق من) طلاب|مشروع طلاب/, "student project"],
];

// Drops comments so a code note about the rule doesn't trip it; `://` in URLs is kept.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(tsx?|css)$/.test(e.name) ? [p] : [];
  });
}

function findProjectFraming(src: string): { line: number; label: string; text: string }[] {
  return stripComments(src)
    .split("\n")
    .flatMap((text, i) => BANNED.filter(([re]) => re.test(text)).map(([, label]) => ({ line: i + 1, label, text: text.trim() })));
}

describe("site copy carries no MVP / Tuwaiq / demo-data framing", () => {
  it("flags each kind of framing that was shipped before", () => {
    // The footer line removed in f0435b7, and lines removed in 59a7611.
    expect(findProjectFraming(`<p>رصّة نسخة أولية (MVP) بُنيت في يومين ضمن مشروع أكاديمية طويق، وكل بياناتها تجريبية.</p>`).map((f) => f.label)).toEqual([
      "MVP",
      "Tuwaiq Academy",
      "first/trial version",
      "built in two days",
      "demo/synthetic data",
    ]);
    expect(findProjectFraming(`<strong>البيانات اصطناعية.</strong>`)).toHaveLength(1);
    expect(findProjectFraming(`<strong>نسخة تجريبية:</strong>`)).toHaveLength(1);
    expect(findProjectFraming(`رصّة، مشروع فريق من ثلاثة طلاب.`)).toHaveLength(1);
  });

  it("allows product wording and comments", () => {
    expect(findProjectFraming(`title="تكلفة الذكاء الاصطناعي للطلب"`)).toEqual([]);
    expect(findProjectFraming(`simulated_outage: "عطل تجريبي متعمَّد لاختبار التنبيهات",`)).toEqual([]);
    expect(findProjectFraming(`// no MVP wording on the site\nconst a = "https://x.y"; // MVP`)).toEqual([]);
  });

  it("finds none in app/, components/ or lib/", () => {
    const hits = SITE_DIRS.flatMap((d) => sourceFiles(join(ROOT, d))).flatMap((file) =>
      findProjectFraming(readFileSync(file, "utf8")).map((h) => `${relative(ROOT, file)}:${h.line} [${h.label}] ${h.text}`),
    );
    expect(
      hits,
      "MVP/Tuwaiq/demo-data framing goes in the English README only (README.md, 'MVP scope'), never in site copy. " +
        "The site's link to the repo is components/SiteFooter.tsx.",
    ).toEqual([]);
  });
});

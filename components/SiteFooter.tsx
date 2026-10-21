import { GitHubIcon } from "@/components/Icons";

export const REPO_URL = "https://github.com/justAbdulaziz10/Rassah";

// Shared by the console and the store: says this is the two-day MVP and links back to the source.
export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border print:hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 text-sm text-muted">
        <p>رصّة نسخة أولية (MVP) بُنيت في يومين ضمن مشروع أكاديمية طويق، وكل بياناتها تجريبية.</p>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded font-medium underline-offset-4 hover:text-foreground hover:underline"
        >
          <GitHubIcon className="size-4" />
          الكود على GitHub
          <span className="sr-only">(يفتح في نافذة جديدة)</span>
        </a>
      </div>
    </footer>
  );
}

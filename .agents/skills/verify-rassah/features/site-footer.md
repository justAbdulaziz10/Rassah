# Site footer

Every page ends with a footer that says Rassah is a two-day MVP built for Tuwaiq Academy on synthetic data, and links to the GitHub repository in a new tab so visitors can get back to the code.

## Sub-features

- `footer.console`: the console pages (orders, notifications, catalog, monitoring, evaluation) share `components/SiteFooter.tsx`.
- `footer.store`: the store uses the same footer.
- `footer.landing`: the landing page footer has the MVP line and the same repo link beside its page links.

## How to get to it (user POV)

- Scroll to the bottom of any page and press «الكود على GitHub».

## Driving it with verify.sh

Preconditions:

- Local baseline or production.

- **Repo link.** `GET` `/`, `/orders` and `/store`; each HTML body contains `href="https://github.com/justAbdulaziz10/Rassah" target="_blank"`.
- **Proof.** `landing.body`, `orders.body`, `store.body`.

## Gotchas

- The check is a fixed string, so it also fails if the link loses `target="_blank"` or the attribute order changes. Update the string here and in `verify.sh` together.
- Print views hide the console footer (`print:hidden`).

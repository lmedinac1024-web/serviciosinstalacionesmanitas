<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Pending list and map share the offline-patched service data; map filters open statuses independently of list tabs so completed services disappear immediately, including before synchronization.
- OCR address fields pass through the shared deterministic address normalizer before returning to forms; this expands known street-type abbreviations without changing destination identity.
- All job map views use JobsMap's browser geolocation watch, cleaned up on unmount; the worker location stays local and separate from service coordinates.
- Weekly dashboard totals use the shared pure weekly-visits aggregator over employee-scoped, offline-patched jobs; Monday–Sunday weeks are numbered from the first Monday, with leading days grouped separately and all groups bounded by the selected month.
- Printable reports (dashboard and ganancias PDF) are built as ReportDoc {title, style, body}, handed over via `src/lib/report-view.ts` (sessionStorage) and rendered on the in-app `/reporte` route with a print button — never via window.open popups, which standalone PWAs on mobile block.

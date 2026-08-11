# VitaTrack Privacy Policy — see the live page

The **canonical** privacy policy is the one shipped in the web app, not this file:

- **Live URL (use this in Play Console):** https://vita-track-life.vercel.app/privacy
- **Source:** `apps/web/src/app/privacy/page.tsx` (rendered via `components/LegalShell.tsx`)
- A matching Terms page is at `/terms` (`apps/web/src/app/terms/page.tsx`).

That page is a full **POPIA** (South Africa) policy — it treats health data as *special personal information* and covers cross-border transfers, ICE profiles, retention, and data-subject rights. It supersedes the earlier generic draft that lived in this file.

## Placeholders to fill before submission
In `apps/web/src/app/privacy/page.tsx` (and one in `terms/page.tsx`):
- `[Registered Company Name]` — for a **personal** account this is the individual operating VitaTrack (the Responsible Party), not a company.
- `[Company Registration Number]` — omit / reword if operating as an individual.
- `[Registered Physical Address, South Africa]`
- `[Information Officer telephone]`
- Confirm the contact email `privacy@vitatrack.co.za` is a mailbox you actually control (or change it).

Once filled, redeploy the web app so the live URL reflects the final text.

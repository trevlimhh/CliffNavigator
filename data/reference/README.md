# Reference data (raw pulls — not curated engine data)

`supportgowhere-raw.json` is a raw, deduped pull from SupportGoWhere's public listing API
(`https://www.ccube.gov.sg/coordinator/api/resources/v1`, the same endpoint the site embeds in
an iframe at `https://supportgowhere.life.gov.sg/topics/<category>`), covering 5 categories:
caregiving support, financial support and benefits, disability support, healthcare and
wellbeing, and family/parenting/relationships.

- **255 unique schemes/services** across those 5 categories (many appear in more than one).
- Each entry has: `id`, `title`, `description` (one-liner, not full eligibility detail),
  `keywords` (tags), `domains` (all categories it's tagged under), and `detailUrl` — the full
  scheme page at `supportgowhere.life.gov.sg/schemes/<id>`, which has real eligibility criteria,
  payout amounts, and a "Scheme last updated" date.
- Regenerate with `npx tsx scripts/fetch-supportgowhere.ts` (hits the live API — no auth needed).

**This is a directory, not a curated dataset.** The listing descriptions are one-liners without
eligibility detail — do not read benefit amounts or eligibility rules off this file directly.
The 5 schemes actually wired into `data/schemes.ts` were re-verified against their individual
`detailUrl` pages (which do carry real eligibility criteria and payout figures with an official
last-updated date), not against this listing file.

Useful for: discovering what else exists in a category before deciding what to add to the
engine's curated `data/schemes.ts`, and for the `id`/`detailUrl` needed to look up a specific
scheme's full detail page.

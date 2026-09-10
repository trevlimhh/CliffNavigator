# Benefit Cliff & Transition Cliff Navigator
 
An AI-powered tool for Singapore family caregivers to understand how a change in
income or a scheme ending affects the government support they receive. Phase 1 built
a deterministic rules engine; Phase 2 added an AI layer on top of it (intake extraction
+ plain-language explanation, see "The AI layer" below); Phase 3 added a Next.js
frontend on top of both (see "The frontend" below); Phase 4 added login, persistence,
and proactive notifications via Supabase (see "Auth, persistence & notifications" below).

## Stack

- Node.js + TypeScript, ESM `import`/`export` syntax throughout
- `vitest` for tests, `tsx` for running TS directly (CLI/scripts), `tsc --noEmit` for type checking
- `@google/genai` + `zod` for the AI layer (structured outputs via `responseJsonSchema` + Zod v4's
  native `z.toJSONSchema()`), `dotenv` to load `.env` in the CLI demo script only (the Next.js app
  loads `.env` itself)
- Next.js 16 (App Router) + React 19 + Tailwind v4 for the frontend, in this same repo/package —
  no monorepo tooling, no separate `package.json`
- Supabase (Postgres + Auth) for login and persistence, `@supabase/ssr` + `@supabase/supabase-js`
  for the client/server/admin wiring, `resend` for notification emails
- No framework dependency in `src/engine.ts` or `data/` — this is meant to be imported unchanged
  into a Next.js app (API route or server action) or any other frontend, so it stays
  framework-free and side-effect-free. `src/services/` is the one part of `src/` that talks to a
  network API — and even that is only ever called from a server-side API route, never the browser.
  `src/lib/supabase/` is the equivalent boundary for the database.

## Commands

```bash
npm install
cp .env.example .env   # fill in what you have — see "Auth, persistence & notifications" for what's required vs. optional
npm test          # run the vitest suite (mocked — no API key, no Supabase, no network needed)
npm run typecheck # tsc --noEmit
npm run dev       # run the Next.js app at http://localhost:3000 (/, /login, /dashboard need
                   # Supabase configured; /demo works with nothing configured at all)
npm run cli       # run src/cli.ts against a sample household (rules engine only, no AI, no browser)
npm run ai-demo   # run src/cli-ai.ts: free text -> Gemini extraction -> engine -> Gemini explanation (needs a real API key)
npx tsx scripts/fetch-supportgowhere.ts  # refresh data/reference/supportgowhere-raw.json
```

## Architecture

```
data/schemes.ts          — the curated scheme dataset the engine runs on. Pure data, no logic.
data/intake-schema.ts    — the questions a future UI must ask to build a HouseholdProfile.
data/reference/          — raw pulls from SupportGoWhere (255 schemes across 5 categories);
                            not curated, not wired into the engine — see its own README.md.
scripts/fetch-supportgowhere.ts — regenerates data/reference/supportgowhere-raw.json.
src/types.ts             — shared types: Scheme, HouseholdProfile, EligibilityResult, SimulationResult,
                            RenewalStatus, IncomeCliffInfo, etc.
src/intakeTypes.ts        — types for data/intake-schema.ts (IntakeField etc.) — UI metadata, not engine data.
src/engine.ts             — pure functions: evaluateEligibility, evaluateAllSchemes, simulateChange,
                             getRenewalStatuses, getIncomeCliffs, estimateCurrentBenefitAmount, normalizeToMonthly
src/cli.ts                — manual exploration script (npm run cli); not a real UI, rules engine only
src/cli-ai.ts              — manual end-to-end AI-layer demo (npm run ai-demo); needs a real API key
src/services/geminiClient.ts     — the one module allowed to touch the Gemini SDK / read GEMINI_API_KEY
src/services/intakeExtraction.ts — Gemini 3.5 Flash-Lite: free text -> structured profile fields
src/services/explanation.ts      — Gemini 3.5 Flash: SimulationResult -> plain-language explanation
tests/                    — vitest suite (48 tests): eligibility edge cases, both simulation paths,
                             renewal-date math, income-cliff math, mocked AI-service tests, and the
                             handoff-summary formatter (no network access or API key needed to run `npm test`)

src/app/demo/page.tsx     — the no-login demo: one client component, 4-step wizard state, nothing
                             persisted (see "The frontend" below for why it was built this way). As
                             of the consistency pass in "Auth, persistence & notifications" below,
                             every step renders the *same* component the authenticated dashboard
                             uses (`ProfileEditor`, `SchemeOverviewSection`, `SimulateStep`,
                             `HandoffStep`) — the demo has no components of its own any more, so it
                             cannot drift out of sync with what a signed-in user sees. Each step
                             also has a "← Back" control that re-enters the previous step with its
                             `useState` untouched, so going back never loses what was typed.
                             Public even when auth is otherwise required (see middleware.ts).
src/app/page.tsx          — "/" is now just a router: no Supabase configured -> friendly fallback
                             pointing at /demo; not signed in -> /login; no profile yet -> /onboarding;
                             otherwise -> /dashboard.
src/app/login/page.tsx, src/app/onboarding/page.tsx, src/app/dashboard/page.tsx, src/app/profile/page.tsx
                             — the real, persistent flow (see "Auth, persistence & notifications" below).
src/components/ProfileEditor.tsx — the structured profile form (fields + members + enrolled
                             schemes with renewal countdowns); shared by onboarding and /profile.
src/app/api/intake/route.ts   — POST {freeText} -> calls extractProfileFromText(), or the mock fallback
src/app/api/simulate/route.ts — POST {profile, change, changeDescription} -> calls simulateChange() +
                                 buildSimulationBriefing() + explainSimulationResult(), or the mock fallback
src/app/api/situation/route.ts — POST {newProfile, changeDescription} -> diffs against the signed-in
                                 user's STORED profile via compareProfiles(), persists the update, logs a notification
src/app/api/notifications/check/route.ts — the scheduled job: renewal + eligibility-change detection across all users
src/components/           — one component per screen/step, plus small shared presentational pieces
src/lib/aiAvailability.ts      — detects "no API key configured" so a route can fall back to mock mode
src/lib/mockAiResponses.ts     — demo-mode fallbacks (regex-based extraction, templated explanation)
src/lib/formatHandoffSummary.ts — pure, deterministic formatter for the handoff-summary text block
src/lib/draftProfile.ts        — editable draft shapes for the Intake/onboarding confirm-and-fill-gaps form
src/lib/notificationEngine.ts  — pure decision logic: what counts as a renewal-due or eligibility-change notification
src/lib/profileRepository.ts   — maps Supabase rows <-> HouseholdProfile; the only file that knows the DB schema
src/lib/supabase/{client,server,admin}.ts — browser / server(RLS) / service-role Supabase clients
src/lib/email.ts                — Resend wrapper; no-ops (logs) if RESEND_API_KEY isn't set
middleware.ts                   — refreshes the Supabase session cookie + gates non-public routes
supabase/migrations/0001_init.sql — the full DB schema (run once in the Supabase SQL Editor)
supabase/functions/check-notifications/ — cron trigger; calls back into /api/notifications/check
```

Data, types, and logic are in separate files on purpose: the dataset is the part that needs
non-engineer sign-off (income thresholds, benefit amounts), so it should never be tangled up
with the code that evaluates it.

## Key design decisions

### Eligibility is not always a boolean

Singapore's caregiver schemes don't share one eligibility shape. Workfare and Silver Support are
formula-driven. **ComCare is explicitly discretionary** — a Social Service Office caseworker
assesses each case, so a hard "eligible: true" would misrepresent it. Home Caregiving Grant and
Caregivers Training Grant both gate on a *certified* care-need assessment (a fact about the
household, not something computable from income).

`EligibilityStatus` therefore has three values, not two:
`"eligible" | "ineligible" | "possibly_eligible_requires_assessment"`.
Any scheme with a `discretionary_assessment` criterion (both ComCare sub-schemes) can never
resolve to a hard `"eligible"` — see `evaluateEligibility()` in `src/engine.ts`. ComCare
Long-Term Assistance (LTA) is the interesting middle case: *eligibility* is still discretionary
(requires an assessment of inability to work), but its *payout amount* is a real published
formula by household size — see `householdSizeTiers` below.

### `gained` / `lost` are eligibility-status transitions, not enrollment transitions

For an **income change**, `simulateChange()` recomputes eligibility for every scheme against the
changed profile and diffs status transitions. This deliberately ignores `enrolledSchemes` for
this path — the point of a cliff navigator is to surface schemes a household could newly claim,
not only ones they already receive.

For a **scheme expiry**, this logic is inverted: income and household composition don't change,
so re-evaluating criteria against an unchanged profile would trivially return the same result for
every scheme, including the one that "expired". Scheme expiry represents an exogenous event (a
time-limited benefit block running out and not being renewed) — so that one scheme's post-change
status is force-set to `"ineligible"`, but only if the household was both enrolled in it *and*
actually receiving it beforehand. See the docstring on `simulateChange()` for the full reasoning
— this was a real bug caught during implementation (the naive "just remove it from the enrolled
list and recompute" approach silently produced a no-op, since eligibility criteria never read
enrollment state).

### `unaffected` can still hide a dollar swing

A means-tested scheme (e.g. Silver Support) can stay "eligible" before and after a change while
moving between income tiers, changing the payout amount. That shows up in
`netMonthlyDollarImpact`, not in the `gained`/`lost` buckets — `unaffected` only means the
eligible/ineligible status didn't flip. Read the dollar figure, not just the three lists.

### `netMonthlyDollarImpact` assumes full take-up — `enrolledNetMonthlyDollarImpact` is the conservative counterpart

The net dollar impact for an income-change simulation sums the estimated monthly value across
every scheme the household **is or becomes eligible for**, regardless of current enrollment. This
is a "best case, you claim everything you qualify for" number, not "money you're definitely
already receiving".

`enrolledNetMonthlyDollarImpact` (in `buildSimulationResult()`, `src/engine.ts`) answers the other
question: "what happens to what this household is *already* receiving." It's the same per-scheme
(after − before) delta, summed only across schemes present in the pre-change profile's
`enrolledSchemes` — a scheme the household newly *gains* never contributes to it, but a
currently-enrolled scheme that's *lost* (via an income threshold, or `scheme_expiry`) does, even
though the scheme also appears in `lost`. Both `simulateChange()` and `compareProfiles()` compute
the enrolled-scheme-id set from the profile as it stood **before** the change, not after — a change
that also edits `enrolledSchemes` (not something either of the two `ProfileChange` variants or
`compareProfiles`'s household-level diff currently do) would still be evaluated against the old
enrollment, which is the intended semantics ("what changed for what you had going in").

`CliffResultPanel.tsx` shows both numbers now: the full-take-up figure as the headline ("if you
claim everything you're eligible for") and the enrolled-only figure underneath ("change to what
you're currently receiving") — deliberately not replacing one with the other, since a caseworker
handoff benefits from seeing untapped potential support while a household asking "how does this
affect me" wants the conservative number front and center too.

**A real discrepancy this caught**: a test simulation (2-person household, income $1,000 →
$3,000, enrolled in SMTA/LTA/CTG/Silver Support) showed a $1,943/month drop, but manually adding
up the two schemes that actually appeared in `lost` (SMTA $500 + LTA $1,250 formula estimates)
only accounted for $1,750 — a $193 gap with no visible explanation anywhere in the UI. The cause:
Silver Support Scheme stayed *eligible* the whole time (per-capita income $500 → $1,500 never
crossed its $2,300 ceiling) but slid from its $650-ceiling tier ($1,080/quarter) to its
$1,700-ceiling tier ($500/quarter) — exactly the "unaffected can still hide a dollar swing" case
documented above, except until now nothing surfaced *which* scheme or *why*. Fixed by adding
`payoutChanged: PayoutChange[]` to `SimulationResult` (`src/types.ts`) — the subset of `unaffected`
schemes whose monthly value delta is non-zero (`Math.abs(delta) > 0.005`, in `buildSimulationResult()`),
each carrying the before/after amount in the scheme's own `benefit.frequency` units. `CliffResultPanel.tsx`
renders it as a fourth card ("Payout changed (still eligible)") alongside Gained/Lost/Needs
assessment, so a tier-only swing is never silent again — a household can now see exactly which
enrolled scheme moved and by how much, not just infer it from the headline total not matching
their own arithmetic.

### `normalizeToMonthly()` treats one-time payouts as $0/month

Smearing a one-off credit (e.g. a hypothetical `"one_time"` frequency) across 12 months would
overstate it as recurring income. None of the current schemes use `"one_time"` — Caregivers
Training Grant is modeled as `"annual"` with a separate `firstYearAmount` — but the policy is
documented in case that changes.

### Individual income is approximated by per-capita household income

`HouseholdProfile` doesn't track each member's individual wage — only household-level income,
household size, ages, employment type, and citizenship per member. Workfare's
`workfare_income_floor` criterion (meant to test the applicant's own wage) uses per-capita
household income as a stand-in. This is flagged inline in `src/engine.ts` as a known
simplification, not a hidden assumption.

By convention, `profile.members[0]` is treated as "the applicant" for applicant-scoped criteria
(age, employment status/type).

### Enrollment is tracked with dates, not just IDs — this is what powers renewal and time-varying-benefit tracking

`HouseholdProfile.enrolledSchemes` is `EnrolledScheme[]` (`{ schemeId, enrollmentDate }`), not a
bare list of IDs. Two features read the enrollment date:

- **`getRenewalStatuses(profile, catalog, asOf?)`** — answers "when does my grant end/need
  renewal". It adds `scheme.duration.renewalCycleMonths` to `enrollmentDate` to get a
  `nextRenewalDate`, and reports `daysUntilRenewal` (negative if overdue). This models the
  *routine* reassessment cycle (e.g. ComCare SMTA's 6-month blocks, HCG's 24-month
  recertification); it can't predict a *discretionary* early non-renewal (e.g. an SSO declining
  to renew SMTA) — that only a real reassessment can determine.
- **`estimateCurrentBenefitAmount(scheme, profile, enrollmentDate, asOf?)`** — for schemes with a
  `firstYearAmount` (currently only CTG: $400 in year one vs $200/year after), this is the one
  function that actually applies it, by comparing `asOf` to one year after `enrollmentDate`.
  `evaluateEligibility()` / `estimateBenefitAmount()` deliberately do NOT take an enrollment date
  and always return the steady-state amount — they answer "would this household qualify at all",
  not "what are they getting paid this month", and conflating those two questions would make the
  core eligibility check depend on state it doesn't need.

### Income-cliff distance is computed proactively, not just simulated on request

`getIncomeCliffs(profile, catalog)` is the counterpart to `simulateChange()`: instead of asking
"what if income becomes $X", it answers "how much room do I have right now before a cliff hits" —
for every scheme, both the **eligibility cliff** (income level that loses the scheme entirely) and,
for means-tested schemes, the **tier cliff** (income level that drops the payout to the next lower
band while remaining eligible). This only models the upper-bound/ceiling cliff — it does not model
Workfare's lower-bound $500 floor (a secondary, waivable edge case handled by
`workfare_income_floor`'s own waiver logic), since "rising income costs you a benefit" is the
primary cliff this tool exists to surface.

### New eligibility-criterion types added for the corrected data

- **`cpf_contributions_by_55`** (Silver Support): passes if *any* member who also clears the
  scheme's own age-65 gate has `cpfContributionsByAge55 <= maxAmount`. This field is required
  (not optional) on every `HouseholdMember` — set to `0` if the member is under 55 or the value is
  unknown, so the engine never has to guess at a missing value.
- **`workfare_income_floor`** (Workfare): a WIS-specific replacement for a generic
  income-threshold criterion, because the real $500 floor is *waivable* for PWDs, ComCare SMTA
  recipients, and caregivers of a certified-care-need household member. See the evaluator in
  `src/engine.ts` for exactly which profile facts trigger the waiver.

### New benefit shapes added for the corrected data

- **`householdSizeTiers`** (ComCare LTA): payout banded by household member count instead of
  income — LTA is the one scheme in this dataset with a genuinely published rate table.
- **`amountByEmploymentType`** (Workfare): employees ($4,900/yr) and self-employed/platform
  workers ($3,267/yr) get different published amounts; keyed by the applicant's `employmentType`.
- **`multiPropertyCapsToLowestTier`** (HCG): households owning more than one property are capped
  at the cheapest means-tested tier regardless of income — a real rule, now enforced rather than
  just noted.
- **`firstYearAmount`** (CTG): see "Enrollment is tracked with dates" above.

## The intake schema: what a UI needs to ask, and why

`data/intake-schema.ts` is the single source of truth for "what questions does a caregiver need
to answer" to populate a `HouseholdProfile`. It's split into three arrays matching the three
repeating shapes in the data model:

- `householdIntakeFields` — asked once per household (income, housing type, AV, property count,
  certified care need).
- `memberIntakeFields` — asked once per household member (age, citizenship, employment type,
  disability, CPF-by-55).
- `enrolledSchemeIntakeFields` — asked once per scheme the household says it's already enrolled
  in (currently just `enrollmentDate`).

Each `IntakeField` (see `src/intakeTypes.ts`) carries `usedBySchemeIds` — which schemes actually
need that answer — so a form can explain *why* it's asking, and `askWhen` as a free-text
conditional hint (e.g. only ask `cpfContributionsByAge55` if `age >= 55`) for a future form layer
to implement; it isn't machine-evaluated by this MVP. This file is intentionally just data (no
form-rendering code) so it can drive whatever UI framework the Next.js app ends up using, and so
the question set and the engine's actual data requirements can never silently drift apart.

## The AI layer: intake extraction + explanation, via Gemini

Two isolated service modules sit on top of the rules engine — neither `src/engine.ts` nor
`data/*.ts` import anything from `src/services/`, so the engine stays testable with zero network
access, and `npm test` never needs a real `GEMINI_API_KEY` (the AI-service tests mock
`getGeminiClient()`).

**Originally built on the Anthropic API** (Haiku for extraction, Sonnet for explanation); switched
to **Google Gemini** (`@google/genai`) since this app's actual usage — two short JSON-structured
calls per user action — costs a fraction of a cent regardless of provider, and Gemini has a
genuinely free tier (unlike Claude/ChatGPT, neither of which offer an ongoing free API allowance).
The switch only touched `src/services/*` and `src/lib/aiAvailability.ts` — nothing in the engine,
the routes' request/response shapes, or the mock-mode fallback logic needed to change, which is
exactly the point of keeping the provider behind an isolated service layer.

- **`gemini-3.5-flash-lite`** for extraction, **`gemini-3.5-flash`** for explanation — a smaller/
  cheaper model for the narrow extraction task and a fuller one for the more nuanced writing task,
  mirroring the original Haiku/Sonnet split. Using two different models also means the two call
  sites draw from separate per-model free-tier quotas rather than sharing one.
- Both use **structured outputs** (`config.responseMimeType: "application/json"` +
  `config.responseJsonSchema`) rather than free-form JSON parsed by hand.
  `toGeminiResponseSchema()` in `src/services/geminiClient.ts` converts a Zod schema to the JSON
  Schema shape Gemini accepts (via Zod v4's native `z.toJSONSchema()`) and works around two
  real Gemini quirks found by inspecting the SDK's own type definitions rather than trusting
  fetched documentation (which gave inconsistent/fabricated details, including a non-existent
  model name, across three separate fetches — the installed package's `.d.ts` was the only source
  trusted in the end): Zod serializes `.nullable()` on a primitive as `{type: ["number","null"]}`,
  a 2020-12-style array type, which isn't in Gemini's documented supported-property subset —
  rewritten into `anyOf: [{type: "number"}, {type: "null"}]`, which is documented as supported.
  The `$schema` meta field Zod adds at the root is stripped for the same reason. Unlike Anthropic's
  `client.messages.parse()`, Gemini's SDK doesn't validate the response against the schema itself
  — both services `.parse()` the returned JSON through the original Zod schema afterward, so a
  malformed response still fails loudly and falls back to mock mode rather than silently passing
  through.
- **`extractProfileFromText()`** turns a caregiver's free-text description into structured,
  nullable fields — it's deliberately conservative: told never to invent a number, age, or date
  that isn't in the text, and to leave a field `null` rather than guess. Scheme mentions ("I'm on
  ComCare") are constrained to a `z.enum` built from the actual scheme catalog's IDs at call time,
  so the model can't hallucinate an ID that doesn't exist — and a generic "ComCare" mention
  defaults to `comcare_smta` per the system prompt, since that's the common case now that ComCare
  is split into two sub-schemes (see the Phase-1 section above). A hypothetical future change
  ("thinking of cutting to part-time") is captured as a qualitative `detectedChange.changeDescription`,
  NOT a fabricated dollar figure — getting an exact new income is left to a follow-up question,
  because a model-invented number here would be indistinguishable from a real one downstream.

  **`missingRequiredFields` is computed in plain TypeScript** (`computeMissingRequiredFields()`),
  by diffing the extraction against `data/intake-schema.ts`'s `required: true` fields — not asked
  of the model. This is the same design principle as the rules engine itself: keep the LLM's job
  narrow (extract + flag uncertainty) and push anything deterministic into testable, mockable-free
  code. `computeMissingRequiredFields()` also evaluates the two `askWhen` conditions from the
  intake schema (`"isApplicant"` and `"age >= 55"`) against the extracted data, so it won't wrongly
  flag e.g. a care recipient's `employmentType` as missing when only the applicant's is asked for.

- **`explainSimulationResult()`** never sees a raw `SimulationResult` or `HouseholdProfile` —
  `buildSimulationBriefing()` (a pure, separately-tested function) formats a small summary first
  (scheme names + amounts + frequencies + net dollar impact only), which is both more
  token-efficient and keeps unnecessary household detail out of the prompt. The system prompt
  hard-requires: plain language over jargon, never presenting figures as an official determination
  (especially important given `discretionary_assessment` schemes and the still-placeholder figures
  noted below), and ending with exactly one concrete suggestion rather than a generic "consult a
  professional." Output is structured into `{headline, explanation, suggestion, caveat}` rather
  than free-flowing prose, so a UI can render each part distinctly.

`src/cli-ai.ts` (`npm run ai-demo`) wires both services to the engine end-to-end for manual
testing — it needs a real `GEMINI_API_KEY` in `.env` (free, no card, at aistudio.google.com/apikey)
and is a demo script, not production code: it papers over any `missingRequiredFields` with
clearly-labeled demo defaults instead of actually asking the user, and simulates an illustrative
flat income drop (since `detectedChange` deliberately doesn't produce an exact number — see above).

## The frontend: one page, four steps, no persistence layer

*(This section describes the original Phase 3 shape. The demo now lives at `src/app/demo/page.tsx`
— "/" became a router once auth existed, see the file map above — and as of the component
unification described under "Auth, persistence & notifications" it renders the same
`ProfileEditor` / `SchemeOverviewSection` / `SimulateStep` / `HandoffStep` components the
authenticated dashboard does, rather than the demo-only components named below. The reasoning in
this section for *why* the demo is one page with in-memory state, no routing, and no database
still holds — that part hasn't changed.)*

The demo UI is a single Next.js page with a 4-step wizard driven entirely by `useState` in one
top-level client component — there is no routing between `/intake`, `/results`, etc., and no
Supabase/database. This was a deliberate choice, not a shortcut: the moment the wizard became
multiple actual Next.js *pages*, the household profile and simulation state would need to survive
a navigation, which forces a choice between URL params, cookies, or a database — all unnecessary
complexity for what is a single person, in one sitting, with no requirement to persist across a
refresh or share a link. Keeping it one page with in-memory step state sidesteps that decision
entirely rather than deferring it. If persistence across sessions/devices is ever needed, that's
the moment to introduce Supabase — not before.

**Only two things run on the server**: `src/app/api/intake/route.ts` and `src/app/api/simulate/route.ts`.
Everything else the wizard needs — `evaluateAllSchemes()`, `simulateChange()`, `getRenewalStatuses()`,
`formatHandoffSummary()` — runs directly in the browser, because the rules engine is just pure
functions over plain data with no secrets involved. Only the two functions that call Gemini
(`extractProfileFromText()`, `explainSimulationResult()`) need a server boundary, since
`GEMINI_API_KEY` must never reach client-side code. The two route handlers are thin: they
parse the request, call the same service functions from Phase 2, and return JSON — no logic of
their own beyond the demo/mock fallback described below.

### Demo/mock mode — the app degrades gracefully with no API key

Since a live key wasn't available for this build, both API routes catch the specific
"`GEMINI_API_KEY is not set`" error (via `src/lib/aiAvailability.ts`'s `isMissingApiKeyError()`)
and fall back to a **clearly labeled** demo response instead of failing the request:

- `mockExtractProfileFromText()` — a regex/keyword-based stand-in for the real extraction call
  (dollar amounts via regex, scheme mentions via a small alias table, "mum"/"dad"/etc. via keyword
  matching). It is real code that reads the real input, just not real language understanding.
- `mockExplainSimulationResult()` — a templated stand-in for the real explanation call that plugs
  the **real, engine-computed** numbers (gained/lost schemes, net dollar impact) into fixed
  sentence templates. The numbers are never fake; only the prose wrapper is non-AI.

Every response built this way carries `source: "mock"` in the JSON, and the UI surfaces this as an
explicit amber "Demo mode — no GEMINI_API_KEY configured" banner in both the intake and
simulate steps — it is never presented as if it were a real AI result. This exists purely so the
UI could be built and rehearsed end-to-end without a key on hand; once `.env` has a real key, both
routes use the live Gemini calls automatically (the fallback only triggers on that one specific
error).

### The "please confirm" fields are computed live, not frozen from extraction time

A real bug caught during manual testing: the Intake step's confirmation form initially computed
which fields to amber-highlight from `extraction.missingRequiredFields` — a snapshot taken once,
at extraction time. As the user filled in a highlighted field, the badge never cleared, even
though the underlying "can I proceed" check (`isDraftComplete()`) was already correctly
re-evaluating on every keystroke and correctly enabling the confirm button. Fixed by computing the
highlight directly from the current draft state (`householdMissing()` / `memberMissing()` in
`IntakeStep.tsx`, checking `=== null`) instead of the stale extraction-time list — the visual
feedback and the actual gating logic now read from the same live source of truth.

### A relative import gotcha: `.js` extensions break Turbopack, `tsx` doesn't need them

`src/engine.ts`, `src/types.ts`, and `src/services/*` were originally written with explicit `.js`
extensions on relative imports (e.g. `from "./engine.js"`), on the assumption that Node's ESM
loader — which `tsx` sits on top of — requires an extension on relative specifiers. Once these
files were pulled into the Next.js build, Turbopack failed with "Module not found" on every one of
those imports: its bundler-style resolver does not perform the ".js resolves to a sibling .ts
file" rewrite. Testing confirmed `tsx` actually resolves *extensionless* relative imports just
fine too (it uses a more lenient esbuild-based resolver, not strict Node ESM) — so every relative
import across `src/` and `data/` was normalized to extensionless, which satisfies `tsx`,
Turbopack, and `tsc` (`"moduleResolution": "bundler"` supports both forms, and extensionless is
the more idiomatic choice for that mode regardless). If you add a new file with a relative import,
leave off the extension.

## Auth, persistence & notifications

Phase 3's demo was deliberately single-session and stateless. Phase 4's requirement — login,
saved profiles across visits, and *proactive* reminders — genuinely needs a backend, so this
introduces Supabase (Postgres + Auth) without touching the rules engine or AI layer at all: they
still don't know persistence exists.

### Setup

Copy `.env.example` to `.env` and fill in, from a Supabase project's **Settings → API**:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Then run
`supabase/migrations/0001_init.sql` once in the Supabase SQL Editor. Everything gracefully
degrades without these — see "Graceful degradation" below — so there's no hard requirement to set
this up before doing anything else with the repo.

### `ProfileEditor.tsx`: structured fields first, free text is an optional accelerator

The first pass had onboarding lead with the free-text intake box (reusing `IntakeStep` verbatim,
since it already existed from the Phase 3 demo). That's the wrong default for a *saved* profile
that expects complete, accurate data — a real form the user can see and correct beats a chat box
that quietly leaves gaps for uncommon fields, especially now that the profile also needs to track
enrolled schemes with dates (never something people write out in prose). `ProfileEditor.tsx`
replaced it: all household/member fields are directly editable from the start, with the free-text
extraction demoted to a collapsed "optional: describe your situation to auto-fill" panel that
merges into the visible fields on demand rather than gating them. It's shared by three places:

- `/onboarding` (`initialProfile: null` — starts from an empty draft)
- `/profile` (`initialProfile` = the loaded profile — the editor form the dashboard's **Profile**
  button links to, for editing anytime)
- The enrolled-schemes section is genuinely new here (Phase 3's `EligibleSchemesStep` only let you
  toggle enrollment with a date inline; it didn't show a countdown). Each added scheme's renewal
  countdown reuses `getRenewalStatuses()` from `src/engine.ts` — via a small
  `previewProfileForRenewals()` helper that constructs a placeholder `HouseholdProfile` around the
  in-progress draft's `enrolledSchemes`, since that engine function only reads that one field. This
  keeps the renewal-date math in the one already-tested place rather than re-deriving it in the
  component.

### Schema (`supabase/migrations/0001_init.sql`)

- `profiles` — 1:1 with `auth.users`; the household-level `HouseholdProfile` fields plus
  `notifications_enabled` / `notification_email` / `onboarding_completed_at`.
- `household_members` — one row per member. `is_applicant` replaces the "members[0] is the
  applicant" array-order convention used everywhere else, since DB rows aren't ordered like an
  array — `profileRepository.ts` sorts applicant-first on load to translate back.
- `enrolled_schemes` — one row per scheme the household says it's on.
- `eligibility_snapshots` — the last-computed `EligibilityResult[]` per profile (as JSONB), so the
  notification check has something to diff the next computation against.
- `notifications` — what the bell icon reads.

Every table has Row Level Security scoped to `auth.uid()` — a user can only ever touch their own
rows. The one deliberate exception: the scheduled notification check authenticates with the
`service_role` key (`src/lib/supabase/admin.ts`), which bypasses RLS by design, because it needs
to process every user's data in one run. That key must never reach the browser.

### `src/lib/profileRepository.ts` is the only file that knows about the schema

`loadProfile()` / `saveProfile()` map between DB rows and the engine's own `HouseholdProfile`
shape. `saveProfile()` uses a delete-then-insert strategy for `household_members` and
`enrolled_schemes` rather than trying to diff/upsert against a client-submitted list — there's no
stable ID for a member coming from the client (they're just array entries), so "replace the whole
set" is simpler and correct, at the cost of not being incremental. Fine at this scale.

Every `throw someError` in this file wraps the raw Supabase/Postgrest error in a real `Error` via a
local `wrapDbError(error, context)` helper, rather than throwing the plain `{code, details, hint,
message}` object Supabase returns. A real bug this caught: adding the `rejected_schemes` table
(below) without yet running its migration surfaced on login as an unreadable raw-object dump in
Next.js's error overlay instead of a message saying which table/query failed — `wrapDbError` turns
any future schema-drift error into something that actually names the failing operation.

### `compareProfiles()` vs. `simulateChange()`

`simulateChange()` (Phase 1) models exactly two hypothetical changes: an income change or one
scheme expiring. The "tell us what's changed" flow (`SituationUpdateCard.tsx` → `/api/situation`)
needed something more general — a life change described in free text could touch *any* field, not
just those two. Rather than duplicate the gained/lost/unaffected/dollar-impact bucketing logic,
`src/engine.ts` now factors it into a private `buildSimulationResult(before, after, catalog)`
that both `simulateChange()` and the new `compareProfiles(oldProfile, newProfile, catalog)` call —
so a "what if" simulation and a "here's what actually changed" comparison always mean the same
thing to the UI, from one tested implementation.

`SituationUpdateCard` only lets the user edit **household-level** fields (income, housing, AV,
property count, care-need flag) — not members or enrolled schemes — on the theory that a quick
"what's changed" note is almost always about one of those. Extraction results merge into the
existing stored profile field-by-field (only overriding what was actually found), rather than
requiring a full re-intake.

**Preview vs. confirm — nothing is saved just from analyzing a change.** `/api/situation` is
preview-only: it diffs the stored profile against the edited one and returns the
simulation+explanation, but never touches the database. Persisting only happens if the user
explicitly says yes on a follow-up "update your profile with this?" prompt, which calls the
separate `/api/situation/confirm` endpoint — the same `newProfile` the preview already computed,
just actually saved this time. This split exists because the original version called
`saveProfile()` immediately after generating the explanation, which meant a user who was only
*exploring* what a hypothetical change would do had already had their real profile overwritten by
the time they saw the result. Two endpoints means "compute the effect" and "commit the effect" can
never be accidentally coupled again.

### Notifications: detection logic vs. delivery vs. scheduling — three separate concerns

- **Detection** (`src/lib/notificationEngine.ts`) — pure functions, no DB, no Supabase import.
  `detectRenewalNotifications()` flags anything overdue or due within 30 days (via the existing
  `getRenewalStatuses()`). `detectEligibilityChangeNotifications()` also still exists here and is
  still unit-tested, but as of the consistency pass below it is **no longer called** by the
  scheduled check — see why below.
- **Delivery** (`src/lib/email.ts`) — every notification always gets an in-app row; email is a
  best-effort side effect only if `notifications_enabled` + `notification_email` are set on the
  profile AND `RESEND_API_KEY` is configured. Missing the key never blocks the in-app notification
  — it just logs and skips the email, same graceful-degradation pattern as `GEMINI_API_KEY`.
- **Scheduling** (`src/app/api/notifications/check/route.ts` + `supabase/functions/check-notifications/`)
  — the route does the real work (loop over every profile, run detection, de-duplicate against
  existing unread notifications of the same type+scheme, insert rows), protected by a shared
  `CRON_SECRET` header rather than user auth (it's not acting as any one user). The Edge Function
  is deliberately a *dumb trigger*: it does nothing but `fetch()` that route on a schedule. This
  was a conscious choice over reimplementing the detection logic in Deno — the rules engine stays
  in exactly one place (this Next.js app), and the Edge Function is disposable/replaceable (any
  cron mechanism that can hit an HTTP endpoint would do). **Deploying and scheduling the Edge
  Function itself needs the Supabase CLI and your own project** — see the comment at the top of
  `supabase/functions/check-notifications/index.ts` for the exact commands. Until that's deployed,
  the detection logic can still be exercised manually by POSTing to `/api/notifications/check`
  yourself (with the `x-cron-secret` header).

**The bell is renewal-only — eligibility changes aren't notifications.** Earlier versions also
inserted a persistent notification the moment a scheme was gained or lost — both from the
scheduled check (diffing against `eligibility_snapshots`) and synchronously from `/api/situation`
right after a situation update. Both were removed: an eligibility change is already surfaced
synchronously, in full, in the UI the moment it happens (`SchemeOverviewSection`'s suggestion
banner, `SituationUpdateCard`'s `CliffResultPanel`) — putting the same event in the bell too was
just repeating something the user had already read, and it muddied the bell's purpose. The bell
is reserved for things that need reminding about *over time*, which in this app is exactly one
thing: a renewal that's coming up or overdue. `eligibility_snapshots` is unused by this route now
(nothing reads or writes it here any more) but the table itself, and `compareProfiles()`'s
gained/lost buckets, are left in place — the buckets still drive the synchronous UI above, and the
table costs nothing sitting idle if snapshot-based detection is ever wanted again.

Each notification row in `NotificationBell.tsx` can also be deleted outright (a small "✕" button
that fades in on hover), not just marked read — a straightforward `DELETE` scoped by RLS to
`auth.uid()`, same trust boundary as everything else in that table.

### Graceful degradation without Supabase configured

Consistent with the `GEMINI_API_KEY` / mock-mode pattern: `src/lib/supabaseConfigured.ts`'s
`isSupabaseConfigured()` guards `/` and `/dashboard`, redirecting to a friendly "Supabase isn't
configured yet — try `/demo`" message instead of crashing. `middleware.ts` also no-ops its own
auth gate entirely when the env vars are absent, so `/login` still renders (it just can't
successfully submit). `/demo` (the original Phase 3 wizard) stays reachable with no login and no
Supabase at all — it's both a permanent no-commitment walkthrough and the thing that still worked
while this phase was being built and manually verified end-to-end without real credentials.

## Deploying to Vercel

The project is git-linked to Vercel (auto-deploys `main` to production on every push) — see
`.git`'s `origin` remote. Set the same variables from `.env.example` in the Vercel dashboard
(**Project → Settings → Environment Variables**); nothing is synced automatically from a local
`.env`, and secrets should never be pasted into a chat/agent session to be set on your behalf.
`APP_URL` should be set to the deployed domain (e.g. `https://benefit-cliff-navigator.vercel.app`)
once you know it, for the Supabase Edge Function's callback.

### A real deploy bug this caught: middleware couldn't run on this Vercel/Next.js combination at all — so it was removed entirely

The first production deploy 500'd on every single request. Root-causing it took four rounds, and
the end state is that **`middleware.ts` no longer exists in this project** — there is no
middleware file to configure or debug, by design.

1. **With `"type": "module"` in `package.json`** (present since before this was a Next.js app, when
   `src/cli.ts`/`src/cli-ai.ts` were the only entry points and needed it for plain-Node ESM
   `import` syntax): Vercel ran `middleware.ts` on the Node.js runtime with no explicit runtime
   declared, and hit `ERR_MODULE_NOT_FOUND` resolving Next's own `next/server` import from the
   compiled bundle. Removing `"type": "module"` "fixed" this — but only by trading it for a worse
   error: **without** it, Node's *default* CJS loader can't parse the bundle's ESM `import` syntax
   at all (`Cannot use import statement outside a module`). So `"type": "module"` was never the bug
   — it's required (`tsx` doesn't need it locally, since it registers its own loader ahead of
   Node's native resolution, but Vercel's compiled middleware output does) — it stayed in
   `package.json` for the rest of this investigation and is still there today.
2. **Forcing `runtime: "nodejs"` explicitly** (via `export const config = { runtime: "nodejs" }`,
   or a top-level `export const runtime = "nodejs"`) — neither is recognized by this Next.js
   version for middleware specifically: both silently dropped middleware from the build entirely
   (no warning, no `ƒ Proxy (Middleware)` line, no `middleware-manifest.json` entry) rather than
   erroring, which would have shipped a build with *zero auth gating* had it not been checked
   locally first. `experimental.nodeMiddleware` in `next.config.ts` (the Node.js-middleware opt-in
   flag from Vercel's own docs) isn't a recognized experimental key in this version either —
   Node.js-runtime middleware appears unsupported here altogether, full stop.
3. **Forcing `runtime: "edge"` explicitly** (middleware's actual default, and the only runtime that
   builds and registers at all) got past both of the above — but then crashed differently in
   production: `ReferenceError: __dirname is not defined`. The working theory at the time was that
   the old `middleware.ts`'s use of `@supabase/ssr`'s `createServerClient()` + `getUser()` (to
   proactively refresh the session cookie on every request) was the cause — that pulls in the full
   `@supabase/supabase-js` client, which unconditionally bundles its Realtime client (built on
   `ws`, a Node-only package) even though middleware never uses Realtime, and `ws` isn't
   Edge-compatible.
4. **That theory turned out to be wrong.** `middleware.ts` was rewritten from scratch with zero
   third-party imports at all (only `next/server`, plus a hand-rolled regex check for the
   `sb-*-auth-token` cookie name instead of a real Supabase client) — and it crashed with the
   *exact same* `ReferenceError: __dirname is not defined`, in the exact same place, on Vercel.
   With no dependency left that could plausibly reference `__dirname`, this ruled out application
   code entirely: it's a genuine platform bug in how this Next.js version's Turbopack build
   compiles *any* `middleware.ts` for Vercel's Edge Runtime, which lacks Node globals like
   `__dirname` by design (it's a V8 isolate, not a Node process).

**The actual fix**: delete `middleware.ts` entirely, and move its two responsibilities into the
two pages that needed them, as plain client-side `useEffect` checks —
[src/app/login/page.tsx](src/app/login/page.tsx) redirects to `/dashboard` if
`supabase.auth.getUser()` already returns a signed-in user, and
[src/app/onboarding/page.tsx](src/app/onboarding/page.tsx) redirects to `/login` if it doesn't.
This is a straight port of what the old dependency-free middleware (round 4, above) was already
doing with the cookie-presence check — just relocated from the (broken) edge middleware layer into
ordinary page components, which have no Edge Runtime restrictions at all. The *actual* security
boundary was never middleware anyway: every page/route already calls its own
`supabase.auth.getUser()` via `src/lib/supabase/server.ts`, which genuinely re-validates against
Supabase regardless of what middleware decided — so removing middleware doesn't weaken
authorization, it only removes a UX convenience (redirecting before a page even renders). The
trade-off given up: no single choke point auto-redirects *every* route any more, and middleware's
proactive session-cookie refresh on server-rendered navigations is gone too — the browser-side
Supabase client (`src/lib/supabase/client.ts`) still auto-refreshes tokens on its own timer, so
this only matters for a tab left idle across a token expiry with no client-side activity to
trigger the browser refresh. If a third page ever needs the same "redirect if signed in/out"
behavior, add the same `useEffect` pattern to it directly — there's no shared gate to update.

If you ever see `ReferenceError: __dirname is not defined` from this app's Vercel deployment again,
the likely cause is someone re-adding a `middleware.ts` file — don't; per the above, Edge-runtime
middleware appears fundamentally broken for this Next.js/Turbopack/Vercel combination, independent
of what the file imports.

## ⚠️ Data status — re-verified 2026-09-07, still needs your final sign-off

The 5 schemes in `data/schemes.ts` were re-checked against their individual pages at
`supportgowhere.life.gov.sg/schemes/<id>` (an initiative run with MSF/MOH/AIC/CPFB), which each
carry their own official "last updated" date (recorded per-scheme as `source.officialLastUpdated`).
This replaced an earlier pass sourced from secondary blog aggregators — **two of those earlier
numbers were meaningfully wrong**, not just unverified:

- Silver Support's real floor is **$215/quarter**, not the $450 first guessed (a ~2x error).
- Workfare pays **self-employed/platform workers $3,267/yr**, a distinct, lower figure from
  employees' $4,900/yr — the first pass modeled one flat amount for everyone.

`source.confidence` is `"verified"` where a number came directly off the scheme's own page, and
still `"placeholder"` wherever that page itself doesn't publish an exact figure — e.g. ComCare
SMTA's payout (genuinely case-by-case, not just unverified by us) and the exact income cutoffs
between Silver Support's and HCG's tiers (the pages state the tier amounts and the overall cap,
but not where the bands split). Read each scheme's `simplificationNote` / `duration.reviewNote`
for the exact status of every figure before a live demo — and re-check even "verified" entries if
significant time has passed, since these are revised at every Budget (Feb) and sometimes mid-year.

`data/reference/supportgowhere-raw.json` (255 schemes across caregiving support, financial
support, disability support, healthcare, and family/parenting) is a raw discovery catalog, not
curated data — see `data/reference/README.md`. It's useful for finding what else exists (e.g. 18
schemes explicitly tagged "Caregiver support" beyond the current 5, such as Take-a-Break respite
care or Grandparent Caregiver Relief tax relief) before deciding what to add next.

## Account settings: password change, notification channels, account deletion

`/settings` ([SettingsPageClient.tsx](src/components/SettingsPageClient.tsx)) has three
independent sections. Each was built with its own care level appropriate to its risk:

### Change password

Re-authenticates with `supabase.auth.signInWithPassword()` using the *current* password before
calling `supabase.auth.updateUser({ password: newPassword })` — Supabase's API alone doesn't
require knowing the old password to set a new one, but silently allowing that would mean anyone
with access to an already-open session (a shared/unlocked device) could lock the real owner out.

### Notification channels: email and push are independent toggles

`profiles.notifications_enabled` was renamed to `email_notifications_enabled` and a new
`push_notifications_enabled` column added (migration `0003_notification_channels.sql`) — one
combined flag couldn't represent "email yes, push no" or vice versa, which is exactly what
"select or enable... push and/or email" requires. `updateNotificationSettings()` in
`profileRepository.ts` is a separate function from `saveProfile()` on purpose: flipping a
notification toggle shouldn't need to resubmit the entire household profile.

**Push is a real implementation, not a stub** — Web Push requires a VAPID keypair (generated once
with `npx web-push generate-vapid-keys` — already generated and placed in `.env` for this project),
a service worker (`public/sw.js`, whose only job is to receive a `push` event and call
`showNotification()`), a `push_subscriptions` table (one row per browser/device, since a push
subscription is device-specific, not account-specific), and `src/lib/sendPush.ts` on the server
side using the `web-push` package. Follows the same graceful-degradation pattern as
`GEMINI_API_KEY`/`RESEND_API_KEY`: missing VAPID env vars means push sends are logged and
skipped, never a hard failure. Expired/revoked subscriptions (HTTP 404/410 from the push service)
are pruned automatically rather than retried forever.

Both `/api/notifications/check` (the scheduled job) and `/api/situation` (the synchronous
"something changed" notification) now attempt both channels independently based on the profile's
two flags — a user can get both an email and a push notification for the same event.

### Delete account

`/api/account/delete` uses the **admin (service_role) client** because Supabase's client SDK has
no self-service "delete my own account" call — only `auth.admin.deleteUser()`, which requires
service_role and must never run in the browser. Deleting the `auth.users` row cascades through
every table's `on delete cascade` FK (profiles → household_members, enrolled_schemes,
eligibility_snapshots, notifications, push_subscriptions), so this one call removes everything.
The UI requires typing "DELETE" plus a native `confirm()` dialog before the request fires — for an
irreversible action, two deliberate steps beats one accidental click.

### Setup

Run `supabase/migrations/0003_notification_channels.sql` in the Supabase SQL Editor (after 0001
and 0002) — **required** even if you don't plan to use push, since it renames a column
`saveProfile()`/`loadNotificationSettings()` now depend on. Web Push additionally needs
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` in `.env` (already
generated for this project — see `.env.example` for how to make a fresh pair if needed).

## Rejected-scheme tracking, the handoff-summary accuracy fix, and the scheme status chart

A caseworker reading the handoff summary needs to know three distinct things about each scheme:
is the household actually receiving it, could they be, and have they already tried and failed.
`formatHandoffSummary()` originally conflated the first two — it printed every scheme's computed
`EligibilityStatus` under one "CURRENT SCHEME STATUS" heading regardless of enrollment, so an
eligible-but-not-yet-applied scheme read exactly like an enrolled one. Fixed by splitting into
**CURRENTLY ENROLLED**, **MAY BE ELIGIBLE FOR (NOT YET ENROLLED)**, and (when applicable)
**PREVIOUSLY APPLIED — NOT APPROVED** — the same three-way split `SchemeOverviewSection.tsx`
already used for its on-screen "Your current schemes" / "You may be eligible for" sections, now
applied consistently to the text summary too. The "estimated total ongoing support" figure was
also silently wrong in the same way — it was summing every *eligible* scheme's amount, not just
enrolled ones, overstating what the household is actually receiving today (that "if you claimed
everything" figure is `netMonthlyDollarImpact`'s job in a simulation, not this summary's).

**Tracking a rejected application** (`RejectedScheme` in `src/types.ts`: `{ schemeId, rejectedDate,
note? }`) is new state, deliberately kept separate from `EligibilityStatus`. A discretionary scheme
(ComCare) can compute as `"possibly_eligible_requires_assessment"` from our rules while the actual
caseworker decision was "no" — eligibility and application outcome are different questions, so
`rejectedSchemes` is optional on `HouseholdProfile` and never read by `evaluateEligibility()` /
`evaluateAllSchemes()` / `simulateChange()`. It's recorded in `ProfileEditor.tsx`'s new "Applied
but not approved" section (mirroring the existing enrolled-schemes add/remove UI — a scheme can
only be in one bucket at a time; enrolling in a scheme clears any earlier rejection for it, and the
"reject" picker excludes anything currently enrolled) and persisted via a new `rejected_schemes`
table (`supabase/migrations/0004_rejected_schemes.sql`, same shape/RLS as `enrolled_schemes`).
`profileRepository.ts` loads/saves it alongside the other two per-scheme tables.

Once tracked, a rejected scheme is excluded from "You may be eligible for" (recommending an
application the household already tried and failed would read as tone-deaf) and gets its own
"Previously applied — not approved" section instead, showing the rejection date/reason and a
"Reapply →" link — reapplying is still often the right move if circumstances changed, so this
isn't a dead end, just correctly labeled.

**Marking/unmarking a rejection is a one-click inline action, not a trip to the profile editor.**
The first version only supported recording a rejection via `ProfileEditor.tsx`'s full form (still
there, and still how `/onboarding` and `/profile` do it) — but a user looking at `SchemeOverviewSection`
on the dashboard had no fast way to act on what they were looking at right there. Each "You may be
eligible for" card now has an "Already applied and got turned down?" link that expands an inline
reason field + confirm/cancel, and each "Previously applied" card has a "Trying again — remove this
record" link — both call a new optional `onProfileUpdated` prop on `SchemeOverviewSection` with the
whole profile patched (add/remove one `RejectedScheme` entry), rather than the component knowing
anything about persistence itself. The two consumers plug in differently: `/demo`'s page just does
`setProfile` (nothing is ever saved there, consistent with the demo's whole design); `DashboardClient`
persists by POSTing the updated profile to `/api/situation/confirm` — reused as-is, since that route's
job is already exactly "save this full profile the user just confirmed," and a one-click reject/unreject
*is* that confirmation, no different in kind from the "Tell us what's changed" yes/no step it was
originally built for. `DashboardClient` does an optimistic local update and reverts it if the save
request fails, surfacing the error inline.

**Self-reported actual amount** (`EnrolledScheme.actualAmount?: number` in `src/types.ts`, same units
as the scheme's own `benefit.frequency`) closes a real accuracy gap: `estimatedBenefitAmount` is a
formula ceiling, but real payouts — especially ComCare's discretionary sub-schemes, which often have
no formula estimate at all (`estimatedBenefitAmount: null`) — can be lower or simply unknowable in
advance. `getReportedAmount(result, enrolledScheme)` in `src/engine.ts` is the one place that decides
which number to show: the household's `actualAmount` if they've entered one, else the computed
estimate, else `null`. This is deliberately a display-only fallback chain — `evaluateEligibility()` /
`simulateChange()` / the cliff math never read `actualAmount`, for the same reason
`estimateCurrentBenefitAmount()` doesn't feed back into core eligibility (see "Enrollment is tracked
with dates" above): what a household could get and what they've told us they actually get are
different questions, and only the display layer needs to reconcile them. Entered per enrolled scheme
in `ProfileEditor.tsx` (a number field alongside the enrollment date, with the computed estimate shown
as placeholder/help text so the user can tell at a glance whether they're overriding anything), stored
in a new `actual_amount` column (`supabase/migrations/0005_enrolled_scheme_actual_amount.sql`, nullable
— unset means "use our estimate," not "receiving $0"). Every place that previously read
`estimatedBenefitAmount` directly for an *enrolled* scheme — `SchemeOverviewSection`'s "Your current
schemes" list, `SchemeStatusChart`'s enrolled total, `formatHandoffSummary()`'s enrolled lines and
running total — now goes through `getReportedAmount()` instead, and shows both figures when they
differ (e.g. "$300/monthly (est. up to $600)") rather than silently picking one.

**`SchemeStatusChart.tsx`** is the "your support at a glance" visual on top of `SchemeOverviewSection`
(so it appears on both `/dashboard` and `/demo` automatically, per the component-unification decision
above). The first version was a set of width-proportional bars, one per scheme — reported back as "not
useful": with only 2-4 schemes in play, a bar chart doesn't earn its screen space over just reading the
numbers. Replaced with a donut: one SVG arc per status (enrolled / eligible-not-enrolled / rejected),
proportioned by *scheme count* rather than dollar amount (answering "what fraction of the grants
relevant to me have I actually obtained," which is the question the shape of a donut naturally answers,
not "how is my money split"), with the household's *obtained %* as the headline number in the center.
Two dollar figures ("$X/month currently enrolled" — via `getReportedAmount()`, not the raw estimate —
and "+$Y/month possible") sit beside it for the money question specifically. Plain SVG circles with
`stroke-dasharray`/`stroke-dashoffset` rather than a charting library — three arcs is simple enough
not to need one; each `<circle>` carries its own `transform="rotate(-90 80 80)"` so the arcs start at
12 o'clock, rather than rotating the whole `<svg>` (which would also rotate the center text sideways
and require counter-rotating it back).

### `CliffResultPanel.tsx`: every scheme surfaced by a simulation gets a follow-up link, not just gained ones

`CliffResultPanel` is the result view for both "Tell us what's changed" (`SituationUpdateCard`) and
"Simulate a change" (`SimulateStep`) — a household runs a check or a hypothetical and sees Gained /
Lost — at risk / Needs assessment, plus the AI-written headline/explanation/suggestion. Originally
only the **Gained** column had a link (an "Apply →" per scheme, built from our own `scheme.source.url`
data, never a URL the AI wrote — same trust boundary as everywhere else in this app). Lost and Needs
assessment were text-only: a household told "you'd lose ComCare" or "this needs an assessment" had
nowhere to click to read the actual criteria or find out how to request that assessment. `SchemeListCard`
now takes a required `linkLabel` instead of an optional `showApplyLink` boolean, so all three columns
render a link per scheme — "Apply →" for Gained, "Learn more →" for Lost and Needs assessment (an
already-turned-down or at-risk scheme isn't something to "apply" for in the same sense, but reading
the official page is still exactly what the household needs next).

## Not yet built

- `/demo` has no persistence by design. The authenticated flow now has a real Supabase project
  behind it and has been exercised (signup, onboarding, dashboard) — but **push notifications and
  account deletion haven't been tested against a real subscribed browser/real account yet**, only
  verified via typecheck + production build (no live credentials to test them with from this
  session). Try enabling push in Settings and check a test notification actually arrives.
- The Supabase Edge Function (`supabase/functions/check-notifications/`) is written but not
  deployed or scheduled — that needs the Supabase CLI and your own project login. Until then, the
  scheduled renewal check only runs if you POST to `/api/notifications/check` yourself.
- The AI layer *has* now been live-tested against the real Gemini API (both extraction and
  explanation, via `/demo` with a real `GEMINI_API_KEY` configured) — this caught and fixed a
  model-name deprecation (`gemini-2.5-flash-lite`/`gemini-2.5-flash` → `gemini-3.5-flash-lite`/
  `gemini-3.5-flash`, see `src/services/geminiClient.ts`). Not yet stress-tested: extraction
  accuracy/tone across a wider variety of free-text phrasing, and latency under load.
- No Singpass integration — email/password and magic-link auth only for now. Singpass would be a
  separate OIDC provider integration layered onto Supabase Auth later, not a blocker today.
- No email deliverability setup beyond Resend's shared `onboarding@resend.dev` test sender — fine
  for development, but a real domain needs verifying in Resend before this could reach real users
  reliably (spam filtering, sender reputation).
- No multi-user support beyond what RLS already provides (each user only ever sees their own
  data) — no household sharing, no caseworker/admin view across users.
- No mobile-responsive pass beyond Tailwind's defaults; no automated browser/e2e tests (Playwright,
  etc.) — only manual verification via the Browser tool, documented per-phase in this file.

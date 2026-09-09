import type { ExplanationResult } from "@/services/explanation";
import type { Scheme, SimulationResult } from "@/types";

interface CliffResultPanelProps {
  simulation: SimulationResult;
  explanation: ExplanationResult;
  source: "live" | "mock";
}

export function CliffResultPanel({ simulation, explanation, source }: CliffResultPanelProps) {
  const impact = simulation.netMonthlyDollarImpact;
  const impactColor = impact > 0 ? "text-emerald-600" : impact < 0 ? "text-rose-600" : "text-slate-600";

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {source === "mock" && (
        <div className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800">
          Demo mode — no GEMINI_API_KEY configured. The numbers below are real, but this explanation is a template, not Gemini's writing.
        </div>
      )}

      <div className="text-center">
        <p className="text-sm text-slate-500">Estimated net impact</p>
        <p className={`text-4xl font-bold ${impactColor}`}>
          {impact >= 0 ? "+" : "-"}${Math.abs(impact).toFixed(0)}
          <span className="text-lg font-medium text-slate-500">/month</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Every scheme surfaced by a simulation gets a follow-up link — "Apply" for a newly
            gained scheme, "Learn more" for one at risk (understand the criteria / how to appeal)
            or one that needs an assessment (how to request one). All point at scheme.source.url,
            our own curated data — never a URL the AI wrote. */}
        <SchemeListCard title="Gained" tone="emerald" schemes={simulation.gained} linkLabel="Apply →" />
        <SchemeListCard title="Lost — at risk" tone="rose" schemes={simulation.lost} linkLabel="Learn more →" />
        <SchemeListCard title="Needs assessment" tone="amber" schemes={simulation.requiresAssessment} linkLabel="Learn more →" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-lg font-semibold text-slate-900">{explanation.headline}</p>
        <p className="mt-2 text-sm text-slate-700">{explanation.explanation}</p>
        <div className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">💡 {explanation.suggestion}</div>

        {/* The AI-written suggestion is prose only — it never fabricates a URL. Any real "go
            apply" link is built here from our own data (scheme.source.url), deterministically,
            for exactly the schemes the household would newly gain. */}
        {simulation.gained.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {simulation.gained.map((scheme) => (
              <a
                key={scheme.id}
                href={scheme.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Apply for {scheme.name} →
              </a>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs italic text-slate-500">{explanation.caveat}</p>
      </div>
    </div>
  );
}

function SchemeListCard({ title, tone, schemes, linkLabel }: { title: string; tone: "emerald" | "rose" | "amber"; schemes: Scheme[]; linkLabel: string }) {
  const toneClasses = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${toneClasses}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{title}</p>
      {schemes.length === 0 ? (
        <p className="mt-1 text-sm opacity-60">None</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {schemes.map((scheme) => (
            <li key={scheme.id}>
              {scheme.name}
              {" — "}
              <a href={scheme.source.url} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
                {linkLabel}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

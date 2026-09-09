"use client";

import { schemes } from "@data/schemes";
import { evaluateAllSchemes, getReportedAmount, normalizeToMonthly } from "@/engine";
import type { HouseholdProfile } from "@/types";

interface SchemeStatusChartProps {
  profile: HouseholdProfile;
}

type BarStatus = "enrolled" | "eligible" | "rejected";

interface SchemeSlice {
  schemeId: string;
  name: string;
  status: BarStatus;
  monthlyAmount: number;
}

const STATUS_STYLES: Record<BarStatus, { stroke: string; dot: string; label: string }> = {
  enrolled: { stroke: "#10b981", dot: "bg-emerald-500", label: "Enrolled" },
  eligible: { stroke: "#3b82f6", dot: "bg-blue-500", label: "Eligible, not enrolled" },
  rejected: { stroke: "#94a3b8", dot: "bg-slate-400", label: "Applied, not approved" },
};

const RADIUS = 60;
const STROKE_WIDTH = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Visualizes the same enrolled/eligible/rejected split SchemeOverviewSection lists as text — a
 * donut of how many of the schemes relevant to this household fall into each bucket, with the
 * "% obtained" the household most wants to know at the center. Plain SVG arcs (no charting
 * dependency) rather than the earlier width-based bar chart, which read as more noise than signal
 * for a 2-4 item list. */
export function SchemeStatusChart({ profile }: SchemeStatusChartProps) {
  const results = evaluateAllSchemes(profile, schemes);
  const enrolledById = new Map(profile.enrolledSchemes.map((e) => [e.schemeId, e]));
  const rejectedIds = new Set((profile.rejectedSchemes ?? []).map((r) => r.schemeId));

  const slices: SchemeSlice[] = [];
  for (const r of results) {
    const enrolled = enrolledById.get(r.scheme.id);
    if (enrolled) {
      const amount = getReportedAmount(r, enrolled);
      slices.push({ schemeId: r.scheme.id, name: r.scheme.name, status: "enrolled", monthlyAmount: amount !== null ? normalizeToMonthly(amount, r.scheme.benefit.frequency) : 0 });
    } else if (rejectedIds.has(r.scheme.id)) {
      slices.push({ schemeId: r.scheme.id, name: r.scheme.name, status: "rejected", monthlyAmount: 0 });
    } else if (r.status !== "ineligible") {
      const amount = r.estimatedBenefitAmount;
      slices.push({ schemeId: r.scheme.id, name: r.scheme.name, status: "eligible", monthlyAmount: amount !== null ? normalizeToMonthly(amount, r.scheme.benefit.frequency) : 0 });
    }
  }

  if (slices.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Your support at a glance</h2>
        <p className="mt-2 text-sm text-slate-500">
          Nothing to show yet — you're not enrolled in or eligible for any scheme we track based on your current profile.
        </p>
      </div>
    );
  }

  const counts: Record<BarStatus, number> = { enrolled: 0, eligible: 0, rejected: 0 };
  for (const s of slices) counts[s.status] += 1;
  const total = slices.length;
  const obtainedPct = Math.round((counts.enrolled / total) * 100);

  const enrolledMonthlyTotal = slices.filter((s) => s.status === "enrolled").reduce((sum, s) => sum + s.monthlyAmount, 0);
  const eligibleMonthlyTotal = slices.filter((s) => s.status === "eligible").reduce((sum, s) => sum + s.monthlyAmount, 0);

  // Build one SVG arc per non-zero status, in a fixed order, each offset by the running total of
  // everything drawn before it. A gap-free donut: dasharray is [segment length, everything else].
  let cumulative = 0;
  const arcs = (["enrolled", "eligible", "rejected"] as BarStatus[])
    .filter((status) => counts[status] > 0)
    .map((status) => {
      const fraction = counts[status] / total;
      const length = fraction * CIRCUMFERENCE;
      const offset = cumulative;
      cumulative += length;
      return { status, length, offset };
    });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Your support at a glance</h2>

      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <svg width="160" height="160" viewBox="0 0 160 160" className="shrink-0">
          <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="#f1f5f9" strokeWidth={STROKE_WIDTH} />
          {arcs.map((arc) => (
            <circle
              key={arc.status}
              cx="80"
              cy="80"
              r={RADIUS}
              fill="none"
              stroke={STATUS_STYLES[arc.status].stroke}
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
              strokeDashoffset={-arc.offset}
              strokeLinecap={arcs.length > 1 ? "butt" : "round"}
              transform="rotate(-90 80 80)"
            />
          ))}
          <text x="80" y="76" textAnchor="middle" fontSize="28" fontWeight="700" fill="#0f172a">
            {obtainedPct}%
          </text>
          <text x="80" y="98" textAnchor="middle" fontSize="11" fill="#64748b">
            obtained
          </text>
        </svg>

        <div className="flex-1 space-y-2">
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{counts.enrolled}</span> of <span className="font-semibold text-slate-900">{total}</span> relevant
            scheme{total === 1 ? "" : "s"} obtained
          </p>
          <p className="text-sm">
            <span className="font-semibold text-emerald-700">${enrolledMonthlyTotal.toFixed(0)}/month</span>{" "}
            <span className="text-slate-500">currently enrolled</span>
          </p>
          {counts.eligible > 0 && (
            <p className="text-sm">
              <span className="font-semibold text-blue-700">+${eligibleMonthlyTotal.toFixed(0)}/month</span>{" "}
              <span className="text-slate-500">possible if you claim everything you're eligible for</span>
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-slate-500">
            {(Object.keys(STATUS_STYLES) as BarStatus[])
              .filter((status) => counts[status] > 0)
              .map((status) => (
                <span key={status} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${STATUS_STYLES[status].dot}`} />
                  {STATUS_STYLES[status].label} ({counts[status]})
                </span>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

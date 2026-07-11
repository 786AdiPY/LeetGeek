"use client";

import { useMemo } from "react";
import type { SyncedSubmission } from "@/lib/types";

// Difficulty is an ordinal severity scale; colours mirror the difficulty tags
// used elsewhere in the app, and every segment/bar carries a direct numeric
// label so identity never rests on colour alone.
const DIFF = [
  { key: "Easy", color: "var(--color-accent-2-500)" },
  { key: "Medium", color: "var(--color-accent-500)" },
  { key: "Hard", color: "var(--color-accent-800)" },
];

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // Sunday-start
  return x;
}

export function Analytics({ submissions }: { submissions: SyncedSubmission[] }) {
  const { weeks, maxWeek, diffCounts } = useMemo(() => {
    // Unique problems for difficulty + topics (a re-solve shouldn't double-count).
    const seen = new Set<string>();
    const uniq: SyncedSubmission[] = [];
    for (const s of submissions) {
      const id = `${s.file_path.split("/")[0]}:${(s.problem_slug || s.problem_id || "").toLowerCase()}`;
      if (!seen.has(id)) { seen.add(id); uniq.push(s); }
    }

    // 12-week activity (by commit, not deduped — activity is activity).
    const now = new Date();
    const buckets: { label: string; start: number; count: number }[] = [];
    const base = startOfWeek(now);
    for (let i = 11; i >= 0; i--) {
      const start = new Date(base);
      start.setDate(start.getDate() - i * 7);
      buckets.push({
        label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        start: start.getTime(),
        count: 0,
      });
    }
    for (const s of submissions) {
      const t = new Date(s.committed_at).getTime();
      for (let i = buckets.length - 1; i >= 0; i--) {
        if (t >= buckets[i].start) { buckets[i].count++; break; }
      }
    }

    const diffCounts = DIFF.map((d) => ({
      ...d,
      count: uniq.filter((s) => (s.difficulty || "Medium") === d.key).length,
    }));

    return {
      weeks: buckets,
      maxWeek: Math.max(1, ...buckets.map((b) => b.count)),
      diffCounts,
    };
  }, [submissions]);

  const totalDiff = diffCounts.reduce((a, d) => a + d.count, 0);
  const kicker = { fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--color-accent)" };

  return (
    <div className="card elev-sm" style={{ padding: "var(--space-4)", gap: "var(--space-4)" }}>
      <h6 className="text-muted" style={{ margin: 0 }}>Analytics</h6>

      {/* Activity over time */}
      <div>
        <span style={kicker}>Activity — last 12 weeks</span>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "96px", marginTop: "10px" }}>
          {weeks.map((w, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: "4px" }}>
              <div
                title={`Week of ${w.label}: ${w.count} commit${w.count === 1 ? "" : "s"}`}
                style={{
                  width: "100%",
                  maxWidth: "26px",
                  height: `${Math.max(w.count === 0 ? 0 : 6, (w.count / maxWeek) * 100)}%`,
                  background: "var(--color-accent)",
                  borderRadius: "4px 4px 0 0",
                  transition: "height 0.2s",
                }}
              />
              <span className="text-muted" style={{ fontSize: "9px", whiteSpace: "nowrap" }}>
                {i % 2 === 0 ? w.label : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <hr className="hr" style={{ margin: "0" }} />

      {/* Difficulty split */}
      <div>
        <span style={kicker}>By difficulty</span>
        {totalDiff === 0 ? (
          <p className="text-muted" style={{ fontSize: "12px", margin: "10px 0 0" }}>No solves yet.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: "2px", height: "14px", marginTop: "10px", borderRadius: "999px", overflow: "hidden" }}>
              {diffCounts.filter((d) => d.count > 0).map((d) => (
                <div key={d.key} title={`${d.key}: ${d.count}`} style={{ width: `${(d.count / totalDiff) * 100}%`, background: d.color }} />
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "10px" }}>
              {diffCounts.map((d) => (
                <span key={d.key} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                  <span style={{ width: "9px", height: "9px", borderRadius: "3px", background: d.color }} />
                  <span className="text-muted">{d.key}</span>
                  <span style={{ fontWeight: 600 }}>{d.count}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import type { SyncedSubmission } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ContactForm } from "@/components/ContactForm";
import { Analytics } from "@/components/Analytics";

interface Props {
  user: {
    username: string;
    extensionToken: string;
    repo: string | null;
  };
  submissions: SyncedSubmission[];
}

const BoltLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--color-accent)" stroke="none">
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
  </svg>
);

const Check = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

// Map a stored file path (e.g. "LeetCode/two_sum.java") to a platform card.
const PLATFORM_META: Record<string, { name: string; abbr: string; kind: "accent" | "accent-2" | "neutral" }> = {
  leetcode: { name: "LeetCode", abbr: "LC", kind: "accent" },
  geeksforgeeks: { name: "GeeksforGeeks", abbr: "GfG", kind: "accent-2" },
  codechef: { name: "CodeChef", abbr: "CC", kind: "neutral" },
  codeforces: { name: "Codeforces", abbr: "CF", kind: "accent" },
  hackerrank: { name: "HackerRank", abbr: "HR", kind: "accent-2" },
};

function platformFromPath(path: string): keyof typeof PLATFORM_META | null {
  const head = (path.split("/")[0] || "").toLowerCase();
  if (head.includes("leet")) return "leetcode";
  if (head.includes("geek")) return "geeksforgeeks";
  if (head.includes("chef")) return "codechef";
  if (head.includes("forces")) return "codeforces";
  if (head.includes("hacker")) return "hackerrank";
  return null;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function computeStreak(dates: string[]): number {
  const days = new Set(
    dates
      .map((d) => new Date(d))
      .filter((d) => !Number.isNaN(d.getTime()))
      .map((d) => d.toDateString())
  );
  if (days.size === 0) return 0;
  let streak = 0;
  const cursor = new Date();
  // Allow the streak to start today or yesterday.
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function DashboardClient({ user, submissions }: Props) {
  const [copied, setCopied] = useState(false);
  const [currentRepo, setCurrentRepo] = useState(user.repo);
  const [showRepoSetup, setShowRepoSetup] = useState(false);
  const [repos, setRepos] = useState<{ full_name: string; private: boolean }[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newRepoName, setNewRepoName] = useState("leetcode-solutions");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [saving, setSaving] = useState(false);
  const [commitPage, setCommitPage] = useState(0);

  // Platforms the extension has actually run on (reported by the dashboard
  // content script via postMessage). Empty until the extension bridges it in.
  const [seenPlatforms, setSeenPlatforms] = useState<string[]>([]);
  const [extensionDetected, setExtensionDetected] = useState(false);
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.source !== window) return;
      const d = e.data;
      if (d && d.source === "leetgeek-extension" && d.type === "SEEN_PLATFORMS") {
        setExtensionDetected(true); // the bridge only runs when the extension is installed
        if (Array.isArray(d.platforms)) setSeenPlatforms(d.platforms as string[]);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Deduplicate to unique problems per platform — a re-solve is a new submission
  // row but the same problem, so it should only be counted once.
  const uniqueProblems = useMemo(() => {
    const map = new Map<string, SyncedSubmission & { _platform: string }>();
    for (const s of submissions) {
      const p = platformFromPath(s.file_path) ?? "other";
      const id = (s.problem_slug || s.problem_id || s.problem_title || "").toLowerCase();
      const key = `${p}:${id}`;
      if (!map.has(key)) map.set(key, { ...s, _platform: p });
    }
    return [...map.values()];
  }, [submissions]);

  const stats = useMemo(() => {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    let easy = 0, medium = 0, hard = 0;
    for (const s of uniqueProblems) {
      const d = s.difficulty?.toLowerCase();
      if (d === "easy") easy++;
      else if (d === "hard") hard++;
      else medium++;
    }
    const thisWeek = uniqueProblems.filter((s) => now - new Date(s.committed_at).getTime() <= week).length;
    return {
      total: uniqueProblems.length,
      easy,
      medium,
      hard,
      week: thisWeek,
      streak: computeStreak(submissions.map((s) => s.committed_at)),
    };
  }, [uniqueProblems, submissions]);

  const platforms = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of uniqueProblems) {
      if (s._platform && s._platform !== "other") counts[s._platform] = (counts[s._platform] ?? 0) + 1;
    }
    return (Object.keys(PLATFORM_META) as (keyof typeof PLATFORM_META)[]).map((key) => ({
      key,
      ...PLATFORM_META[key],
      count: counts[key] ?? 0,
      connected: seenPlatforms.includes(key) || (counts[key] ?? 0) > 0,
    }));
  }, [uniqueProblems, seenPlatforms]);

  const copyToken = async () => {
    await navigator.clipboard.writeText(user.extensionToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const openRepoSetup = async () => {
    setShowRepoSetup(true);
    setLoadingRepos(true);
    const res = await fetch("/api/repos");
    const data = await res.json();
    setRepos(data.repos ?? []);
    setLoadingRepos(false);
  };

  const saveRepo = async () => {
    setSaving(true);
    const body = creating ? { create: true, repoName: newRepoName } : { fullName: selectedRepo };
    const res = await fetch("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setCurrentRepo(`${data.owner}/${data.repo}`);
    setShowRepoSetup(false);
    setSaving(false);
  };

  const steps = [
    { done: true, label: "Connect GitHub", meta: `github.com/${user.username}` },
    {
      done: !!currentRepo,
      label: "Choose a repository",
      meta: currentRepo ?? undefined,
      action: !currentRepo ? "repo" : undefined,
    },
    {
      done: extensionDetected,
      label: "Install the browser extension",
      meta: extensionDetected ? "installed ✓" : undefined,
      action: extensionDetected ? undefined : ("install" as const),
    },
  ];

  const tagClass = (d: string) =>
    d === "Easy" ? "tag tag-accent-2" : d === "Hard" ? "tag tag-outline" : "tag tag-accent";

  const markStyle = (kind: "accent" | "accent-2" | "neutral") => {
    if (kind === "accent") return { bg: "var(--color-accent-100)", fg: "var(--color-accent-700)" };
    if (kind === "accent-2") return { bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-700)" };
    return { bg: "var(--color-neutral-200)", fg: "var(--color-neutral-800)" };
  };

  const kicker = { fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--color-accent)" };
  const bigNum = { fontFamily: "var(--font-heading)", fontSize: "30px", lineHeight: 1 };

  const COMMITS_PER_PAGE = 3;
  const totalCommitPages = Math.max(1, Math.ceil(submissions.length / COMMITS_PER_PAGE));
  const page = Math.min(commitPage, totalCommitPages - 1);
  const pagedCommits = submissions.slice(page * COMMITS_PER_PAGE, page * COMMITS_PER_PAGE + COMMITS_PER_PAGE);

  return (
    <div style={{ minHeight: "100vh", padding: "var(--space-6) var(--space-6) var(--space-8)" }}>
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          maxWidth: "1180px",
          margin: "0 auto var(--space-6)",
        }}
      >
        <span style={{ display: "grid", placeItems: "center", width: "38px", height: "38px", borderRadius: "12px", background: "var(--color-accent-100)" }}>
          <BoltLogo />
        </span>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: "22px", marginRight: "auto" }}>LeetGeek</span>
        <span className="text-muted lg-mono" style={{ fontSize: "13px" }}>@{user.username}</span>
        <ThemeToggle />
        <button type="button" className="btn btn-secondary" style={{ fontSize: "12px" }} onClick={() => signOut({ callbackUrl: "/" })}>
          Sign out
        </button>
      </div>

      <div style={{ maxWidth: "1180px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* Hero */}
        <div style={{ marginBottom: "var(--space-1)" }}>
          <h1 style={{ fontSize: "38px", marginBottom: "6px" }}>
            Your solutions,
            <br />
            committed for you.
          </h1>
          <p className="text-muted" style={{ maxWidth: "46ch", margin: 0 }}>
            Solve on any platform, LeetGeek pushes each accepted answer straight to your repo, sorted and labelled.
          </p>
        </div>

        {/* Stats strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr) 1.6fr", gap: "var(--space-3)" }}>
          <div className="card elev-sm" style={{ gap: "2px" }}>
            <span style={kicker}>Day streak</span>
            <span style={bigNum}>{stats.streak}</span>
            <span className="text-muted" style={{ fontSize: "11px" }}>
              {stats.streak > 0 ? "🔥 keep it going" : "start your streak today"}
            </span>
          </div>
          <div className="card elev-sm" style={{ gap: "2px" }}>
            <span style={kicker}>Total solved</span>
            <span style={bigNum}>{stats.total}</span>
            <span className="text-muted" style={{ fontSize: "11px" }}>across {platforms.length} platforms</span>
          </div>
          <div className="card elev-sm" style={{ gap: "2px" }}>
            <span style={kicker}>This week</span>
            <span style={bigNum}>{stats.week}</span>
            <span className="text-muted" style={{ fontSize: "11px" }}>accepted &amp; committed</span>
          </div>
          <div className="card elev-sm" style={{ justifyContent: "center", gap: "10px" }}>
            <span style={kicker}>By difficulty</span>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "14px" }}>
              {[
                { n: stats.easy, label: "Easy", color: "var(--color-accent-2-700)" },
                { n: stats.medium, label: "Medium", color: "var(--color-accent-700)" },
                { n: stats.hard, label: "Hard", color: "var(--color-accent-900)" },
              ].map((d) => (
                <div key={d.label} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: "20px", lineHeight: 1, color: d.color }}>{d.n}</span>
                  <span className="text-muted" style={{ fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Setup checklist */}
        <div className="card elev-sm" style={{ padding: "var(--space-4)" }}>
          <h6 className="text-muted" style={{ margin: "0 0 var(--space-3)" }}>Setup</h6>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {steps.map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    flex: "none",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: step.done ? "var(--color-accent-2-500)" : "var(--color-neutral-300)",
                    color: step.done ? "#fff" : "var(--color-neutral-700)",
                  }}
                >
                  {step.done ? <Check /> : i + 1}
                </span>
                <span style={{ fontWeight: 600 }}>{step.label}</span>
                {step.meta && (
                  <span className="text-muted lg-mono" style={{ marginLeft: "auto", fontSize: "12px" }}>{step.meta}</span>
                )}
                {step.action === "repo" && (
                  <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto", fontWeight: 600, fontSize: "13px" }} onClick={openRepoSetup}>
                    Set up →
                  </button>
                )}
                {step.action === "install" && !step.meta && (
                  <a href="#install" style={{ marginLeft: "auto", fontWeight: 600, fontSize: "13px" }}>How to install →</a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Repo setup panel */}
        {showRepoSetup && (
          <div className="card elev-sm" style={{ padding: "var(--space-4)", border: "1px solid var(--color-accent)" }}>
            <h6 className="text-muted" style={{ margin: "0 0 var(--space-3)" }}>Target repository</h6>
            <div className="seg" style={{ display: "inline-flex", marginBottom: "var(--space-3)", border: "1px solid var(--color-divider)", borderRadius: "999px", overflow: "hidden" }}>
              {["Existing", "Create new"].map((label, idx) => {
                const active = creating === (idx === 1);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setCreating(idx === 1)}
                    className="lg-toggle-btn"
                    style={{
                      background: active ? "var(--color-accent)" : "transparent",
                      color: active ? "var(--color-bg)" : "var(--color-text)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {creating ? (
              <input className="input" value={newRepoName} onChange={(e) => setNewRepoName(e.target.value)} placeholder="repo-name" style={{ marginBottom: "var(--space-3)" }} />
            ) : (
              <select className="input" value={selectedRepo} onChange={(e) => setSelectedRepo(e.target.value)} style={{ marginBottom: "var(--space-3)" }}>
                <option value="">{loadingRepos ? "Loading…" : "Select a repo"}</option>
                {repos.map((r) => (
                  <option key={r.full_name} value={r.full_name}>
                    {r.full_name} {r.private ? "🔒" : ""}
                  </option>
                ))}
              </select>
            )}

            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="btn btn-primary" onClick={saveRepo} disabled={saving || (!creating && !selectedRepo)}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowRepoSetup(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Tracked platforms */}
        <div className="card elev-sm" style={{ padding: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h6 className="text-muted" style={{ margin: "0 0 var(--space-3)" }}>Tracked platforms</h6>
            <span className="text-muted" style={{ fontSize: "12px" }}>Auto-commit on accepted</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-3)" }}>
            {platforms.map((p) => {
              const mark = markStyle(p.kind);
              return (
                <div key={p.key} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "var(--space-3)", border: "1px solid var(--color-divider)", borderRadius: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                    <span style={{ display: "grid", placeItems: "center", width: "32px", height: "32px", borderRadius: "10px", background: mark.bg, color: mark.fg, fontFamily: "var(--font-heading)", fontSize: "13px", flex: "none" }}>{p.abbr}</span>
                    <span style={{ fontWeight: 600, fontSize: "14px" }}>{p.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {p.connected ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-accent-2-700)" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-accent-2-500)" }} />
                        Connected
                      </span>
                    ) : (
                      <span className="text-muted" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-neutral-400)" }} />
                        Not connected
                      </span>
                    )}
                    <span className="text-muted lg-mono" style={{ fontSize: "12px" }}>{p.count} solved</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Extension token */}
        <div className="card elev-sm" style={{ padding: "var(--space-4)", gap: "var(--space-3)" }}>
          <div>
            <h6 className="text-muted" style={{ margin: "0 0 4px" }}>Extension token</h6>
            <p className="text-muted" style={{ margin: 0, fontSize: "13px" }}>
              Paste this into the LeetGeek extension popup to link it to your account.
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <input className="input lg-mono" style={{ flex: 1, fontSize: "13px" }} value={user.extensionToken} readOnly />
            <button type="button" className="btn btn-primary" style={{ minWidth: "96px" }} onClick={copyToken}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Install instructions */}
        <div id="install" className="card elev-sm" style={{ padding: "var(--space-4)", gap: "var(--space-3)" }}>
          <h6 className="text-muted" style={{ margin: 0 }}>Install the extension</h6>
          <ol style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px", fontSize: "14px" }}>
            <li>
              <a href="/extension.zip" download style={{ fontWeight: 600 }}>Download extension.zip</a>, then unzip it.
            </li>
            <li>
              Open your browser extension settings  → enable Developer Mode.
            </li>
            <li>
              Click <strong>Load unpacked</strong> → select the unzipped folder.
            </li>
            <li>
              Click the ⚡ icon in the toolbar → paste your token → <strong>Save</strong>.
            </li>
          </ol>
        </div>

        {/* Analytics */}
        {submissions.length > 0 && <Analytics submissions={submissions} />}

        {/* Recent commits */}
        <div className="card elev-sm" style={{ padding: "var(--space-4)", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h6 className="text-muted" style={{ margin: 0 }}>Recent commits</h6>
            {submissions.length > COMMITS_PER_PAGE && (
              <span className="text-muted" style={{ fontSize: "12px" }}>
                {page * COMMITS_PER_PAGE + 1}–{Math.min((page + 1) * COMMITS_PER_PAGE, submissions.length)} of {submissions.length}
              </span>
            )}
          </div>
          {submissions.length === 0 ? (
            <p className="text-muted" style={{ textAlign: "center", padding: "var(--space-6) 0", margin: 0, fontSize: "14px" }}>
              No submissions yet. Solve a problem to see commits appear here.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {pagedCommits.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    padding: "11px 0",
                    borderBottom: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
                  }}
                >
                  <span className={tagClass(s.difficulty)} style={{ minWidth: "64px", justifyContent: "center", flex: "none" }}>{s.difficulty}</span>
                  <span className="text-muted lg-mono" style={{ fontSize: "12px", flex: "none" }}>#{s.problem_id}</span>
                  <span style={{ fontWeight: 600, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.problem_title}</span>
                  <span className="text-muted lg-mono" style={{ fontSize: "12px", marginLeft: "auto", flex: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>{s.file_path}</span>
                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${s.problem_title} solution`)}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Watch video solutions on YouTube"
                    aria-label={`Watch video solutions for ${s.problem_title}`}
                    className="text-muted"
                    style={{ flex: "none", display: "grid", placeItems: "center", width: "22px", height: "22px", borderRadius: "6px" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 8.64v6.72L15.27 12 10 8.64zM21.6 7.2s-.19-1.36-.78-1.96c-.75-.79-1.59-.79-1.98-.84C16.06 4.2 12 4.2 12 4.2h-.01s-4.05 0-6.83.2c-.39.05-1.23.05-1.98.84-.59.6-.78 1.96-.78 1.96S2 8.8 2 10.4v1.19c0 1.6.2 3.2.2 3.2s.19 1.36.78 1.96c.75.79 1.73.76 2.18.85 1.58.15 6.72.2 6.72.2s4.06-.01 6.84-.21c.39-.05 1.23-.05 1.98-.84.59-.6.78-1.96.78-1.96s.2-1.6.2-3.2V10.4c0-1.6-.2-3.2-.2-3.2z"/></svg>
                  </a>
                  <span className="text-muted" style={{ fontSize: "12px", flex: "none", width: "72px", textAlign: "right" }}>{relativeTime(s.committed_at)}</span>
                </div>
              ))}
            </div>
          )}
          {submissions.length > COMMITS_PER_PAGE && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "12px" }}
                onClick={() => setCommitPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ← Prev
              </button>
              <span className="text-muted" style={{ fontSize: "12px", minWidth: "48px", textAlign: "center" }}>
                {page + 1} / {totalCommitPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "12px" }}
                onClick={() => setCommitPage((p) => Math.min(totalCommitPages - 1, p + 1))}
                disabled={page >= totalCommitPages - 1}
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Contact */}
        <ContactForm />
      </div>
    </div>
  );
}

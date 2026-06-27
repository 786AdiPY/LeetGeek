"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import type { SyncedSubmission } from "@/lib/types";

interface Props {
  user: {
    username: string;
    extensionToken: string;
    repo: string | null;
  };
  submissions: SyncedSubmission[];
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

  const copyToken = async () => {
    await navigator.clipboard.writeText(user.extensionToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    const body = creating
      ? { create: true, repoName: newRepoName }
      : { fullName: selectedRepo };

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
    { done: true, label: "Connect GitHub" },
    { done: !!currentRepo, label: currentRepo ? `Repo: ${currentRepo}` : "Select target repo" },
    { done: false, label: "Install Chrome extension" },
  ];

  const diffColor = (d: string) =>
    d === "Easy" ? "bg-green-500/20 text-green-400"
    : d === "Medium" ? "bg-yellow-500/20 text-yellow-400"
    : "bg-red-500/20 text-red-400";

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <span className="text-2xl font-bold text-yellow-400">⚡ LeetGeek</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">@{user.username}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Setup Steps */}
      <div className="bg-gray-900 rounded-xl p-5 mb-5 border border-gray-800">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Setup
        </h2>
        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  step.done
                    ? "bg-green-500/20 text-green-400"
                    : "bg-gray-800 text-gray-500"
                }`}
              >
                {step.done ? "✓" : i + 1}
              </div>
              <span className={step.done ? "text-gray-300 text-sm" : "text-gray-500 text-sm"}>
                {step.label}
              </span>
              {i === 1 && !step.done && (
                <button
                  onClick={openRepoSetup}
                  className="ml-auto text-xs px-3 py-1 bg-yellow-500/10 text-yellow-400 rounded-lg hover:bg-yellow-500/20 transition-colors"
                >
                  Set Up →
                </button>
              )}
              {i === 2 && (
                <a
                  href="#install"
                  className="ml-auto text-xs px-3 py-1 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors"
                >
                  How to install →
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Repo Setup Panel */}
      {showRepoSetup && (
        <div className="bg-gray-900 rounded-xl p-5 mb-5 border border-yellow-500/30">
          <h2 className="font-semibold mb-4 text-sm">Target Repository</h2>
          <div className="flex gap-2 mb-4">
            {["Existing", "Create New"].map((label, i) => (
              <button
                key={label}
                onClick={() => setCreating(i === 1)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  creating === (i === 1)
                    ? "bg-yellow-500 text-gray-900"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {creating ? (
            <input
              value={newRepoName}
              onChange={(e) => setNewRepoName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm mb-4 text-gray-100"
              placeholder="repo-name"
            />
          ) : (
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm mb-4 text-gray-100"
            >
              <option value="">
                {loadingRepos ? "Loading…" : "Select a repo"}
              </option>
              {repos.map((r) => (
                <option key={r.full_name} value={r.full_name}>
                  {r.full_name} {r.private ? "🔒" : ""}
                </option>
              ))}
            </select>
          )}

          <div className="flex gap-2">
            <button
              onClick={saveRepo}
              disabled={saving || (!creating && !selectedRepo)}
              className="px-4 py-2 bg-yellow-500 text-gray-900 rounded-lg font-semibold text-sm disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setShowRepoSetup(false)}
              className="px-4 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Extension Token */}
      <div className="bg-gray-900 rounded-xl p-5 mb-5 border border-gray-800">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Extension Token
        </h2>
        <p className="text-xs text-gray-600 mb-3">
          Paste this in the LeetGeek Chrome extension popup.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-gray-800 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-300 truncate">
            {user.extensionToken}
          </code>
          <button
            onClick={copyToken}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0 ${
              copied
                ? "bg-green-500/20 text-green-400"
                : "bg-gray-800 hover:bg-gray-700 text-gray-300"
            }`}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Install Instructions */}
      <div id="install" className="bg-gray-900 rounded-xl p-5 mb-5 border border-gray-800">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Install Extension
        </h2>
        <ol className="space-y-1.5 text-sm text-gray-400 list-none">
          {[
            <>Extension folder is at <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">E:\LeetcodeXGithub\extension</code> on your machine</>,
            <>Open Chrome → <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">chrome://extensions</code> → enable Developer Mode</>,
            "Click Load Unpacked → select the extension folder",
            "Click the ⚡ icon in toolbar → paste your token above → Save",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-gray-600 shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Recent Commits */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Recent Commits
        </h2>
        {submissions.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">
            No submissions yet. Solve a problem on LeetCode to see commits here.
          </p>
        ) : (
          <div className="space-y-1">
            {submissions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 py-2.5 border-b border-gray-800/60 last:border-0"
              >
                <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${diffColor(s.difficulty)}`}>
                  {s.difficulty}
                </span>
                <span className="text-sm font-medium truncate">
                  #{s.problem_id} {s.problem_title}
                </span>
                <code className="ml-auto text-xs text-gray-600 truncate max-w-[180px] shrink-0">
                  {s.file_path}
                </code>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

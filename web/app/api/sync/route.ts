import { NextRequest, NextResponse } from "next/server";
import { getUserByExtensionToken, isAlreadySynced, logSubmission } from "@/lib/db";
import { buildFilePaths, buildFileContent, commitToGitHub } from "@/lib/github";
import type { SyncPayload } from "@/lib/types";

const ALLOWED_ORIGINS = new Set([
  "https://leetcode.com",
  "https://www.geeksforgeeks.org",
  "https://www.codechef.com",
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://leetcode.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-extension-token",
    "Vary": "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 200, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const CORS = corsHeaders(origin);

  const token = req.headers.get("x-extension-token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401, headers: CORS });
  }

  const user = await getUserByExtensionToken(token);
  if (!user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401, headers: CORS });
  }

  if (!user.target_repo_owner || !user.target_repo_name) {
    return NextResponse.json(
      { error: "Repo not configured. Visit leetgeek.vercel.app to set up." },
      { status: 400, headers: CORS }
    );
  }

  let payload: SyncPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const { submissionId, code, language, problem, platform = "leetcode" } = payload;
  if (!submissionId || !code || !language || !problem) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400, headers: CORS });
  }

  const alreadySynced = await isAlreadySynced(user.id, submissionId);
  if (alreadySynced) {
    return NextResponse.json({ status: "already_synced" }, { headers: CORS });
  }

  const { filePaths, ext } = buildFilePaths(
    problem.questionId,
    problem.titleSlug,
    language,
    problem.topicTags,
    platform
  );

  const content = buildFileContent(
    code,
    problem.questionId,
    problem.title,
    problem.titleSlug,
    problem.difficulty,
    ext,
    platform
  );

  const commitMessage = `solve: #${problem.questionId} ${problem.title} [${problem.difficulty}]`;
  const committedPaths: string[] = [];
  let lastSha = "";

  for (const filePath of filePaths) {
    try {
      lastSha = await commitToGitHub({
        token: user.github_access_token,
        owner: user.target_repo_owner,
        repo: user.target_repo_name,
        filePath,
        content,
        message: commitMessage,
      });
      committedPaths.push(filePath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "GitHub API error";
      return NextResponse.json({ error: msg }, { status: 502, headers: CORS });
    }
  }

  await logSubmission({
    user_id: user.id,
    leetcode_submission_id: submissionId,
    problem_id: problem.questionId,
    problem_title: problem.title,
    problem_slug: problem.titleSlug,
    difficulty: problem.difficulty,
    language,
    topic: problem.topicTags[0]?.name ?? "Uncategorized",
    file_path: committedPaths.join(","),
    commit_sha: lastSha,
  });

  return NextResponse.json({ status: "committed", filePaths: committedPaths, commitSha: lastSha }, { headers: CORS });
}

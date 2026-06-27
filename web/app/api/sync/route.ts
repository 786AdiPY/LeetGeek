import { NextRequest, NextResponse } from "next/server";
import { getUserByExtensionToken, isAlreadySynced, logSubmission } from "@/lib/db";
import { buildFilePath, buildFileContent, commitToGitHub } from "@/lib/github";
import type { SyncPayload } from "@/lib/types";

const CORS = {
  "Access-Control-Allow-Origin": "https://leetcode.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-extension-token",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS });
}

export async function POST(req: NextRequest) {
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

  const { submissionId, code, language, problem } = payload;
  if (!submissionId || !code || !language || !problem) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400, headers: CORS });
  }

  const alreadySynced = await isAlreadySynced(user.id, submissionId);
  if (alreadySynced) {
    return NextResponse.json({ status: "already_synced" }, { headers: CORS });
  }

  const { filePath, ext } = buildFilePath(
    problem.questionId,
    problem.titleSlug,
    language,
    problem.topicTags
  );

  const content = buildFileContent(
    code,
    problem.questionId,
    problem.title,
    problem.titleSlug,
    problem.difficulty,
    ext
  );

  let commitSha: string;
  try {
    commitSha = await commitToGitHub({
      token: user.github_access_token,
      owner: user.target_repo_owner,
      repo: user.target_repo_name,
      filePath,
      content,
      message: `solve: #${problem.questionId} ${problem.title} [${problem.difficulty}]`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "GitHub API error";
    return NextResponse.json({ error: msg }, { status: 502, headers: CORS });
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
    file_path: filePath,
    commit_sha: commitSha,
  });

  return NextResponse.json({ status: "committed", filePath, commitSha }, { headers: CORS });
}

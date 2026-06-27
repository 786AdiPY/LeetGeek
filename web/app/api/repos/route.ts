import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserByGithubId, updateUserRepo } from "@/lib/db";
import { listUserRepos, createRepo } from "@/lib/github";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.githubAccessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const repos = await listUserRepos(session.githubAccessToken);
  return NextResponse.json({ repos });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.githubId || !session.githubAccessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserByGithubId(session.githubId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  let owner: string;
  let repo: string;

  if (body.create) {
    const result = await createRepo(
      session.githubAccessToken,
      body.repoName ?? "leetcode-solutions"
    );
    owner = result.owner;
    repo = result.repo;
  } else {
    const parts = (body.fullName as string).split("/");
    owner = parts[0];
    repo = parts[1];
  }

  await updateUserRepo(user.id, owner, repo);
  return NextResponse.json({ owner, repo });
}

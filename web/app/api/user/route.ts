import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserByGithubId, getRecentSubmissions } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.githubId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserByGithubId(session.githubId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const submissions = await getRecentSubmissions(user.id);

  return NextResponse.json({
    user: {
      username: user.github_username,
      extensionToken: user.extension_token,
      repo:
        user.target_repo_owner && user.target_repo_name
          ? `${user.target_repo_owner}/${user.target_repo_name}`
          : null,
    },
    submissions,
  });
}

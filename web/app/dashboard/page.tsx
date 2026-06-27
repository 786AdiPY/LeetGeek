import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserByGithubId, getRecentSubmissions } from "@/lib/db";
import { DashboardClient } from "@/components/DashboardClient";

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  if (!session?.githubId) redirect("/");

  const user = await getUserByGithubId(session.githubId);
  if (!user) redirect("/");

  const submissions = await getRecentSubmissions(user.id);

  return (
    <DashboardClient
      user={{
        username: user.github_username,
        extensionToken: user.extension_token,
        repo:
          user.target_repo_owner && user.target_repo_name
            ? `${user.target_repo_owner}/${user.target_repo_name}`
            : null,
      }}
      submissions={submissions}
    />
  );
}

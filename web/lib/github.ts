import { Octokit } from "@octokit/rest";

const LANG_EXT: Record<string, string> = {
  python3: "py", python: "py",
  cpp: "cpp", c: "c",
  java: "java", javascript: "js",
  typescript: "ts", rust: "rs",
  go: "go", kotlin: "kt", csharp: "cs",
};

const COMMENT: Record<string, string> = {
  py: "#", cpp: "//", c: "//", java: "//",
  js: "//", ts: "//", rs: "//", go: "//",
  kt: "//", cs: "//",
};

export function buildFilePaths(
  questionId: string,
  titleSlug: string,
  language: string,
  topicTags: { name: string }[],
  platform = "leetcode"
): { filePaths: string[]; ext: string } {
  const slug = titleSlug.replace(/-/g, "_");
  const ext = LANG_EXT[language] ?? "txt";

  const PLATFORM_FOLDER: Record<string, string> = {
    leetcode: "LeetCode",
    geeksforgeeks: "GeeksForGeeks",
    codechef: "CodeChef",
  };
  const folder = PLATFORM_FOLDER[platform] ?? "LeetCode";

  return { filePaths: [`${folder}/${slug}.${ext}`], ext };
}

const PLATFORM_URL: Record<string, string> = {
  leetcode: "https://leetcode.com/problems",
  geeksforgeeks: "https://www.geeksforgeeks.org/problems",
  codechef: "https://www.codechef.com/problems",
};

export function buildFileContent(
  code: string,
  questionId: string,
  title: string,
  titleSlug: string,
  difficulty: string,
  ext: string,
  platform = "leetcode"
): string {
  const cc = COMMENT[ext] ?? "//";
  const base = PLATFORM_URL[platform] ?? PLATFORM_URL.leetcode;
  return (
    `${cc} ${title} [${difficulty}]\n` +
    `${cc} ${base}/${titleSlug}/\n\n` +
    code
  );
}

export async function commitToGitHub(params: {
  token: string;
  owner: string;
  repo: string;
  filePath: string;
  content: string;
  message: string;
}): Promise<string> {
  const octokit = new Octokit({ auth: params.token });

  let sha: string | undefined;
  try {
    const { data } = await octokit.repos.getContent({
      owner: params.owner,
      repo: params.repo,
      path: params.filePath,
    });
    if (!Array.isArray(data)) sha = data.sha;
  } catch {
    // new file — no sha needed
  }

  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner: params.owner,
    repo: params.repo,
    path: params.filePath,
    message: params.message,
    content: Buffer.from(params.content).toString("base64"),
    ...(sha ? { sha } : {}),
  });

  return data.commit.sha ?? "";
}

export async function listUserRepos(token: string) {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.repos.listForAuthenticatedUser({
    per_page: 100,
    sort: "updated",
    type: "owner",
  });
  return data.map((r) => ({
    name: r.name,
    full_name: r.full_name,
    private: r.private,
  }));
}

export async function createRepo(
  token: string,
  repoName: string
): Promise<{ owner: string; repo: string }> {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.repos.createForAuthenticatedUser({
    name: repoName,
    description: "LeetCode solutions — auto-synced by LeetGeek",
    private: false,
    auto_init: true,
  });
  return { owner: data.owner.login, repo: data.name };
}

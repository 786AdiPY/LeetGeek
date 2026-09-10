import { Octokit } from "@octokit/rest";

const LANG_EXT: Record<string, string> = {
  python3: "py", python: "py", py: "py",
  cpp: "cpp", c: "c",
  java: "java", javascript: "js",
  typescript: "ts", rust: "rs",
  go: "go", kotlin: "kt", csharp: "cs",
};

export function detectLanguageFromCode(code?: string): string | null {
  if (!code || typeof code !== "string") return null;
  const c = code.trim();

  // C++ indicators
  if (
    c.includes("#include") ||
    c.includes("using namespace std") ||
    c.includes("std::") ||
    c.includes("cout <<") ||
    c.includes("cin >>")
  ) {
    return "cpp";
  }

  // Python indicators
  if (
    c.includes("def ") ||
    c.includes("import sys") ||
    c.includes("if __name__ ==") ||
    /for\s+\w+\s+in\s+range/.test(c) ||
    (/print\s*\(/.test(c) && !c.includes(";"))
  ) {
    return "py";
  }

  // Java indicators
  if (
    c.includes("public class") ||
    c.includes("System.out.print") ||
    c.includes("public static void main")
  ) {
    return "java";
  }

  // C indicators
  if (
    c.includes("#include <stdio.h>") ||
    c.includes("#include <stdlib.h>") ||
    c.includes("printf(") ||
    c.includes("scanf(")
  ) {
    return "c";
  }

  // Rust indicators
  if (c.includes("fn main()") || c.includes("println!")) {
    return "rs";
  }

  // Go indicators
  if (c.includes("package main") || c.includes("fmt.Println")) {
    return "go";
  }

  // JavaScript / TypeScript
  if (c.includes("console.log") || c.includes("function ") || c.includes("const ") || c.includes("let ")) {
    return "js";
  }

  return null;
}

export function normalizeLanguage(lang: unknown, code?: string): string {
  const l = lang !== undefined && lang !== null ? String(lang).toLowerCase().trim() : "";

  if (l.includes("cpp") || l.includes("c++") || l === "g++" || l.includes("gcc++")) return "cpp";
  if (l.includes("python") || l.includes("pyth") || l.includes("pypy") || l.includes("py3")) return "py";
  if (l.includes("java") && !l.includes("script")) return "java";
  if (l.includes("javascript") || l.includes("node") || l === "js") return "js";
  if (l.includes("typescript") || l === "ts") return "ts";
  if (l.includes("c#") || l.includes("csharp") || l === "cs") return "cs";
  if (l === "c" || l.includes("gcc") || l.includes("clang") || l.startsWith("c99") || l.startsWith("c11")) return "c";
  if (l.includes("rust") || l === "rs") return "rs";
  if (l.includes("golang") || l.includes("go")) return "go";
  if (l.includes("kotlin") || l === "kt") return "kt";
  if (l.includes("ruby") || l === "rb") return "rb";
  if (l.includes("swift")) return "swift";
  if (l.includes("php")) return "php";
  if (l.includes("scala")) return "scala";
  if (l.includes("haskell") || l === "hs") return "hs";
  if (l.includes("shell") || l.includes("bash")) return "sh";
  if (l.includes("sql")) return "sql";

  if (LANG_EXT[l]) return LANG_EXT[l];

  // Code Sniffing Fallback if lang is missing, numeric, or unmapped
  if (code) {
    const codeExt = detectLanguageFromCode(code);
    if (codeExt) return codeExt;
  }

  return "txt";
}

const COMMENT: Record<string, string> = {
  py: "#", cpp: "//", c: "//", java: "//",
  js: "//", ts: "//", rs: "//", go: "//",
  kt: "//", cs: "//", rb: "#", swift: "//",
  php: "//", scala: "//", hs: "--", sh: "#",
};

export function buildFilePaths(
  questionId: string,
  titleSlug: string,
  language: string,
  topicTags: { name: string }[],
  platform = "leetcode",
  code?: string
): { filePaths: string[]; ext: string } {
  const slug = titleSlug.replace(/-/g, "_");
  const ext = normalizeLanguage(language, code);

  const PLATFORM_FOLDER: Record<string, string> = {
    leetcode: "LeetCode",
    geeksforgeeks: "GeeksForGeeks",
    codechef: "CodeChef",
    codeforces: "Codeforces",
    hackerrank: "HackerRank",
  };
  const folder = PLATFORM_FOLDER[platform] ?? "LeetCode";

  return { filePaths: [`${folder}/${slug}.${ext}`], ext };
}

const PLATFORM_URL: Record<string, string> = {
  leetcode: "https://leetcode.com/problems",
  geeksforgeeks: "https://www.geeksforgeeks.org/problems",
  codechef: "https://www.codechef.com/problems",
  codeforces: "https://codeforces.com/problemset/problem",
  hackerrank: "https://www.hackerrank.com/challenges",
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
}): Promise<{ sha: string; skipped?: boolean }> {
  const octokit = new Octokit({ auth: params.token });

  let sha: string | undefined;
  try {
    const { data } = await octokit.repos.getContent({
      owner: params.owner,
      repo: params.repo,
      path: params.filePath,
    });
    if (!Array.isArray(data)) {
      sha = data.sha;
      // Content deduplication: check if existing file content matches new content exactly
      if ("content" in data && typeof data.content === "string") {
        const existingContent = Buffer.from(data.content, "base64").toString("utf-8");
        if (existingContent.trim() === params.content.trim()) {
          console.log(`[LeetGeek] Deduplicated: content for ${params.filePath} is identical. Skipping commit.`);
          return { sha: data.sha, skipped: true };
        }
      }
    }
  } catch {
    // new file — no sha needed
  }

  try {
    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner: params.owner,
      repo: params.repo,
      path: params.filePath,
      message: params.message,
      content: Buffer.from(params.content).toString("base64"),
      ...(sha ? { sha } : {}),
    });
    return { sha: data.commit.sha ?? "" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number })?.status;
    if (status === 409 || msg.includes("expected") || msg.includes("sha")) {
      console.warn(`[LeetGeek] SHA collision for ${params.filePath}, refetching latest SHA and retrying...`);
      try {
        const { data: latest } = await octokit.repos.getContent({
          owner: params.owner,
          repo: params.repo,
          path: params.filePath,
        });
        const freshSha = !Array.isArray(latest) ? latest.sha : undefined;
        if (freshSha && !Array.isArray(latest) && "content" in latest && typeof latest.content === "string") {
          const existingContent = Buffer.from(latest.content, "base64").toString("utf-8");
          if (existingContent.trim() === params.content.trim()) {
            console.log(`[LeetGeek] Deduplicated on retry: content for ${params.filePath} is identical.`);
            return { sha: freshSha, skipped: true };
          }
        }
        const { data: retryData } = await octokit.repos.createOrUpdateFileContents({
          owner: params.owner,
          repo: params.repo,
          path: params.filePath,
          message: params.message,
          content: Buffer.from(params.content).toString("base64"),
          ...(freshSha ? { sha: freshSha } : {}),
        });
        return { sha: retryData.commit.sha ?? "" };
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw err;
  }
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

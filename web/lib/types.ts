export interface User {
  id: string;
  github_id: string;
  github_username: string;
  github_access_token: string;
  target_repo_owner: string | null;
  target_repo_name: string | null;
  extension_token: string;
  created_at: string;
  updated_at: string;
}

export interface SyncedSubmission {
  id: string;
  user_id: string;
  leetcode_submission_id: string;
  problem_id: string;
  problem_title: string;
  problem_slug: string;
  difficulty: string;
  language: string;
  topic: string;
  file_path: string;
  commit_sha: string | null;
  committed_at: string;
}

export type Platform = "leetcode" | "geeksforgeeks" | "codechef";

export interface SyncPayload {
  submissionId: string;
  code: string;
  language: string;
  platform?: Platform;
  problem: {
    questionId: string;
    title: string;
    titleSlug: string;
    difficulty: string;
    topicTags: { name: string }[];
  };
}

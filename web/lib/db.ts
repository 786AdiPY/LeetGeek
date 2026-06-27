import { createClient } from "@supabase/supabase-js";
import type { User, SyncedSubmission } from "./types";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function upsertUser(data: {
  github_id: string;
  github_username: string;
  github_access_token: string;
}): Promise<void> {
  const { error } = await supabase
    .from("users")
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: "github_id" }
    );
  if (error) throw error;
}

export async function getUserByGithubId(githubId: string): Promise<User | null> {
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("github_id", githubId)
    .single();
  return data ?? null;
}

export async function getUserByExtensionToken(token: string): Promise<User | null> {
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("extension_token", token)
    .single();
  return data ?? null;
}

export async function updateUserRepo(
  userId: string,
  owner: string,
  repo: string
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ target_repo_owner: owner, target_repo_name: repo })
    .eq("id", userId);
  if (error) throw error;
}

export async function isAlreadySynced(
  userId: string,
  submissionId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("synced_submissions")
    .select("id")
    .eq("user_id", userId)
    .eq("leetcode_submission_id", submissionId)
    .maybeSingle();
  return !!data;
}

export async function logSubmission(
  data: Omit<SyncedSubmission, "id" | "committed_at">
): Promise<void> {
  const { error } = await supabase.from("synced_submissions").insert(data);
  if (error && !error.message.includes("duplicate")) throw error;
}

export async function getRecentSubmissions(
  userId: string,
  limit = 20
): Promise<SyncedSubmission[]> {
  const { data, error } = await supabase
    .from("synced_submissions")
    .select("*")
    .eq("user_id", userId)
    .order("committed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

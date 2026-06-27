create extension if not exists "pgcrypto";

create table if not exists users (
  id                  uuid        primary key default gen_random_uuid(),
  github_id           text        unique not null,
  github_username     text        not null,
  github_access_token text        not null,
  target_repo_owner   text,
  target_repo_name    text,
  extension_token     uuid        unique not null default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists synced_submissions (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references users(id) on delete cascade,
  leetcode_submission_id  text        not null,
  problem_id              text        not null,
  problem_title           text        not null,
  problem_slug            text        not null,
  difficulty              text        not null,
  language                text        not null,
  topic                   text        not null,
  file_path               text        not null,
  commit_sha              text,
  committed_at            timestamptz not null default now(),
  unique(user_id, leetcode_submission_id)
);

create index if not exists idx_users_extension_token
  on users(extension_token);

create index if not exists idx_submissions_user_id
  on synced_submissions(user_id, committed_at desc);

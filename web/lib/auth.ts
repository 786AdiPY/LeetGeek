import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { upsertUser } from "./db";

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: { params: { scope: "read:user repo" } },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "github" && account.access_token) {
        await upsertUser({
          github_id: account.providerAccountId,
          github_username: user.name ?? user.email ?? "unknown",
          github_access_token: account.access_token,
        });
      }
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        token.githubId = account.providerAccountId;
        token.githubAccessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.githubId = token.githubId as string;
      session.githubAccessToken = token.githubAccessToken as string;
      return session;
    },
  },
};

declare module "next-auth" {
  interface Session {
    githubId: string;
    githubAccessToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubId?: string;
    githubAccessToken?: string;
  }
}

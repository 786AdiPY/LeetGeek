import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/SignInButton";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="text-center max-w-xl">
        <div className="text-6xl mb-6">⚡</div>
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
          LeetGeek
        </h1>
        <p className="text-xl text-gray-400 mb-8">
          Every accepted LeetCode, GeeksForGeeks, and CodeChef submission
          automatically committed to your GitHub repo. Install once, forget forever.
        </p>
        <div className="flex gap-6 justify-center mb-10 text-sm text-gray-500">
          <span><span className="text-green-400 mr-1">✓</span>No polling</span>
          <span><span className="text-green-400 mr-1">✓</span>Instant commits</span>
          <span><span className="text-green-400 mr-1">✓</span>Zero maintenance</span>
        </div>
        <SignInButton />
      </div>
    </main>
  );
}

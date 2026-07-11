import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/SignInButton";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <main style={{ minHeight: "100vh", padding: "var(--space-6)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          maxWidth: "1180px",
          margin: "0 auto var(--space-8)",
        }}
      >
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: "38px",
            height: "38px",
            borderRadius: "12px",
            background: "var(--color-accent-100)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--color-accent)" stroke="none">
            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
          </svg>
        </span>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: "22px", marginRight: "auto" }}>
          LeetGeek
        </span>
        <ThemeToggle />
      </div>

      <div
        style={{
          maxWidth: "620px",
          margin: "0 auto",
          textAlign: "center",
          paddingTop: "var(--space-8)",
        }}
      >
        <h1 style={{ fontSize: "48px", marginBottom: "var(--space-3)" }}>
          Your solutions,
          <br />
          committed for you.
        </h1>
        <p className="text-muted" style={{ fontSize: "17px", maxWidth: "48ch", margin: "0 auto var(--space-6)" }}>
          Every accepted LeetCode, GeeksforGeeks, and CodeChef submission automatically
          pushed to your GitHub repo — sorted and labelled. Install once, forget forever.
        </p>

        <div
          style={{
            display: "flex",
            gap: "var(--space-4)",
            justifyContent: "center",
            marginBottom: "var(--space-8)",
            flexWrap: "wrap",
          }}
        >
          {["No polling", "Instant commits", "Zero maintenance"].map((f) => (
            <span
              key={f}
              className="text-muted"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px" }}
            >
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: "var(--color-accent-2-500)",
                  color: "#fff",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              {f}
            </span>
          ))}
        </div>

        <SignInButton />
      </div>
    </main>
  );
}

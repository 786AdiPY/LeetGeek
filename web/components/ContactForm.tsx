"use client";

import { useState } from "react";

// Set your Formspree form endpoint in .env.local as NEXT_PUBLIC_FORMSPREE_ENDPOINT
// (e.g. https://formspree.io/f/xxxxxxxx). Falls back to empty = "not configured".
const ENDPOINT = process.env.NEXT_PUBLIC_FORMSPREE_ENDPOINT ?? "";

type Status = "idle" | "sending" | "sent" | "error";

export function ContactForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setStatus("error");
      setError("Please enter your email so I can reply.");
      return;
    }
    if (!message.trim()) return;
    if (!ENDPOINT) {
      setStatus("error");
      setError("Contact form isn't configured yet.");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, message }),
      });
      if (res.ok) {
        setStatus("sent");
        setEmail("");
        setMessage("");
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus("error");
        setError(data?.errors?.[0]?.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  };

  return (
    <div className="card elev-sm" style={{ padding: "var(--space-4)", gap: "var(--space-3)" }}>
      <div>
        <h6 className="text-muted" style={{ margin: "0 0 4px" }}>Get in touch</h6>
        <p className="text-muted" style={{ margin: 0, fontSize: "13px" }}>
          Found a bug or have feedback? Send a message, I&apos;d love to hear from you.
        </p>
      </div>

      {status === "sent" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 14px",
            borderRadius: "999px",
            background: "var(--color-accent-2-100)",
            color: "var(--color-accent-2-700)",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Thanks! Your message was sent.
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div className="field">
            <label>Your email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="field">
            <label>Message</label>
            <textarea
              className="input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's on your mind?"
              required
              style={{ minHeight: "96px", resize: "vertical", borderRadius: "16px", paddingTop: "10px" }}
            />
          </div>
          {status === "error" && (
            <span style={{ fontSize: "12px", color: "var(--color-accent-700)" }}>{error}</span>
          )}
          <div>
            <button type="submit" className="btn btn-primary" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Send message"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand-mark">JT</div>
        <h1 className="auth-title">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="auth-sub">
          {mode === "login"
            ? "Sign in to your private job tracker."
            : "Your applications stay private to your account."}
        </p>

        <div className="auth-tabs" role="tablist">
          <button
            className={`auth-tab${mode === "login" ? " active" : ""}`}
            onClick={() => {
              setMode("login");
              setError("");
            }}
            type="button"
          >
            Sign in
          </button>
          <button
            className={`auth-tab${mode === "register" ? " active" : ""}`}
            onClick={() => {
              setMode("register");
              setError("");
            }}
            type="button"
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="your_username"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "register" ? "At least 6 characters" : "••••••••"}
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary" type="submit" disabled={busy} style={{ justifyContent: "center", padding: 11 }}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

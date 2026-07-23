"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";
type Step = "form" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isChannel, setIsChannel] = useState(false);
  const [channelLabel, setChannelLabel] = useState("");
  const [channelDescription, setChannelDescription] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(m: Mode) {
    setMode(m);
    setStep("form");
    setError("");
    setNotice("");
    setCode("");
  }

  async function post(url: string, payload: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  async function run(fn: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  const doLogin = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await post("/api/auth/login", { email, password });
      router.push("/");
      router.refresh();
    });
  };

  const registerPayload = () => ({
    email,
    username,
    password,
    isChannel,
    channelLabel: isChannel ? channelLabel : "",
    channelDescription: isChannel ? channelDescription : "",
  });

  const doRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await post("/api/auth/register", registerPayload());
      setStep("otp");
      setNotice(`We sent a 6-digit code to ${email}.`);
    });
  };

  const doVerify = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await post("/api/auth/verify", { email, code });
      router.push("/");
      router.refresh();
    });
  };

  const resend = () =>
    run(async () => {
      await post("/api/auth/register", registerPayload());
      setNotice(`New code sent to ${email}.`);
    });

  return (
    <div className="auth-wrap">
      {/* Left — brand + slogan */}
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <div className="auth-brand-logo">
            <div className="brand-mark">JT</div>
            <span>JobTrack</span>
          </div>
          <h2 className="auth-slogan">
            Track every application.
            <br />
            Land the job you want.
          </h2>
          <p className="auth-slogan-sub">
            Your whole job hunt — applications, interviews, follow-ups and live
            job feeds — organised in one private, always-in-sync dashboard.
          </p>
          <ul className="auth-features">
            <li>Track every application from wishlist to offer</li>
            <li>Subscribe to live job feeds from 10+ sources</li>
            <li>Follow friends and share your pipeline</li>
          </ul>
        </div>
      </aside>

      {/* Right — auth form */}
      <div className="auth-panel">
        <div className="auth-card">
        <div className="brand-mark">JT</div>
        <h1 className="auth-title">
          {mode === "login"
            ? "Welcome back"
            : step === "otp"
              ? "Verify your email"
              : "Create your account"}
        </h1>
        <p className="auth-sub">
          {mode === "login"
            ? "Sign in with your email and password."
            : step === "otp"
              ? "Enter the code we emailed you to finish signing up."
              : "Your applications stay private to your account."}
        </p>

        {step === "form" && (
          <div className="auth-tabs" role="tablist">
            <button
              className={`auth-tab${mode === "login" ? " active" : ""}`}
              onClick={() => switchMode("login")}
              type="button"
            >
              Sign in
            </button>
            <button
              className={`auth-tab${mode === "register" ? " active" : ""}`}
              onClick={() => switchMode("register")}
              type="button"
            >
              Create account
            </button>
          </div>
        )}

        {/* Sign in */}
        {mode === "login" && (
          <form className="auth-form" onSubmit={doLogin}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                placeholder="you@example.com"
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
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ justifyContent: "center", padding: 11 }}>
              {busy ? "Please wait…" : "Sign in"}
            </button>
          </form>
        )}

        {/* Create account — details */}
        {mode === "register" && step === "form" && (
          <form className="auth-form" onSubmit={doRequestOtp}>
            <div className="field">
              <label htmlFor="r-email">Email</label>
              <input
                id="r-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="r-username">Username</label>
              <input
                id="r-username"
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
              <label htmlFor="r-password">Password</label>
              <input
                id="r-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 6 characters"
                required
              />
            </div>

            {/* Channel (publisher) signup */}
            <label className="channel-toggle">
              <input
                type="checkbox"
                checked={isChannel}
                onChange={(e) => setIsChannel(e.target.checked)}
              />
              <span>Sign up as a channel</span>
            </label>
            <p className="channel-note">
              A channel is a job-posting account. Other people can <strong>subscribe</strong> to
              you, and every job you post is delivered straight into their list. Choose this if you
              want to <strong>publish jobs</strong> for others to follow — recruiters, communities,
              or curators.
            </p>

            {isChannel && (
              <>
                <div className="field">
                  <label htmlFor="r-clabel">Channel name</label>
                  <input
                    id="r-clabel"
                    value={channelLabel}
                    onChange={(e) => setChannelLabel(e.target.value)}
                    placeholder="e.g. Bengaluru Frontend Jobs"
                    maxLength={80}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="r-cdesc">Channel description</label>
                  <textarea
                    id="r-cdesc"
                    value={channelDescription}
                    onChange={(e) => setChannelDescription(e.target.value)}
                    placeholder="What kind of jobs will you post? Who is this feed for?"
                    maxLength={300}
                    rows={3}
                    required
                  />
                </div>
              </>
            )}
            {error && <div className="auth-error">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ justifyContent: "center", padding: 11 }}>
              {busy ? "Sending code…" : "Send verification code"}
            </button>
          </form>
        )}

        {/* Create account — OTP */}
        {mode === "register" && step === "otp" && (
          <form className="auth-form" onSubmit={doVerify}>
            <div className="field">
              <label htmlFor="code">Verification code</label>
              <input
                id="code"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                autoFocus
                required
              />
            </div>
            {notice && (
              <div className="auth-error" style={{ color: "var(--good)", background: "color-mix(in srgb, var(--good) 12%, transparent)" }}>
                {notice}
              </div>
            )}
            {error && <div className="auth-error">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ justifyContent: "center", padding: 11 }}>
              {busy ? "Verifying…" : "Verify & create account"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <button type="button" className="auth-tab" style={{ flex: "none", padding: 4 }} onClick={() => switchMode("register")}>
                ← Back
              </button>
              <button type="button" className="auth-tab" style={{ flex: "none", padding: 4 }} onClick={resend} disabled={busy}>
                Resend code
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );
}

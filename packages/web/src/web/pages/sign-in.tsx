import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Wordmark } from "../components/crew/chrome";
import { usePageMeta } from "../hooks/use-page-meta";
import { authClient, captureToken } from "../lib/auth";
import { client } from "../lib/api";
import { cn } from "../lib/utils";
import { LegalLinks } from "../components/crew/legal";

type Mode = "sign-in" | "sign-up";

/** Only same-site paths are honoured as a post-sign-in destination. */
function safeNext(): string | null {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : null;
}

const inputCls = "cx-input";

export default function SignInPage() {
  usePageMeta("Sign in — Sanctuary Crew", { noindex: true });
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "email" | "google">(null);
  const [error, setError] = useState<string | null>(null);

  const land = async () => {
    const next = safeNext();
    if (next) return navigate(next, { replace: true });
    try {
      const me = await client.me.session();
      navigate(me.isStaff ? "/staff" : "/portal", { replace: true });
    } catch {
      navigate("/portal", { replace: true });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("email");
    try {
      const res =
        mode === "sign-in"
          ? await authClient.signIn.email({ email: email.trim(), password }, captureToken)
          : await authClient.signUp.email({ email: email.trim(), password, name: name.trim() || email.trim() }, captureToken);
      if (res.error) {
        const code = res.error.code ?? "";
        setError(
          res.error.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : code === "INVALID_EMAIL_OR_PASSWORD"
              ? "That email and password don't match."
              : code.includes("ALREADY_EXISTS")
                ? "An account with this email already exists. Sign in instead."
                : code === "PASSWORD_TOO_SHORT"
                  ? "Use at least 10 characters."
                  : (res.error.message ?? "Could not sign in."),
        );
        return;
      }
      await land();
    } catch (err) {
      setError((err as Error).message || "Network error. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    setError(null);
    setBusy("google");
    try {
      const result = await authClient.managedAuth.signIn({ provider: "google" });
      if (result.error) {
        if (result.error.code !== "POPUP_CLOSED") setError(result.error.message ?? "Google sign-in failed.");
        return;
      }
      await land();
    } catch (err) {
      setError((err as Error).message || "Google sign-in failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main id="main" className="flex min-h-[100svh] items-start justify-center bg-sx-black px-5 py-16 sm:items-center">
      <div className="w-full max-w-sm">
        <Link href="/" aria-label="Sanctuary LV — home">
          <Wordmark />
        </Link>
        <h1 className="heading mt-10 text-4xl">{mode === "sign-in" ? "Sign in" : "Create account"}</h1>
        <p className="mt-3 text-sm text-white/70">
          For crew members and staff. An account on its own grants no access: staff roles are granted individually, and crew profiles are linked with a
          one-time code from your recruiter.
        </p>

        <div className="mt-8 grid grid-cols-2 border border-white/20">
          {(["sign-in", "sign-up"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn("min-h-11 text-[12px] font-medium uppercase tracking-[0.16em]", mode === m ? "bg-white text-sx-black" : "text-white/70 hover:text-white")}
            >
              {m === "sign-in" ? "Sign in" : "New account"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {mode === "sign-up" && (
            <div>
              <label htmlFor="si-name" className="mb-1 block text-xs font-medium text-white/75">
                Name
              </label>
              <input id="si-name" aria-label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
          )}
          <div>
            <label htmlFor="si-email" className="mb-1 block text-xs font-medium text-white/75">
              Email
            </label>
            <input
              id="si-email"
              aria-label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "si-err" : undefined}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="si-password" className="mb-1 block text-xs font-medium text-white/75">
              Password
            </label>
            <input
              id="si-password"
              aria-label="Password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={mode === "sign-up" ? "si-pw-hint" : error ? "si-err" : undefined}
              className={inputCls}
            />
            {mode === "sign-up" && (
              <p id="si-pw-hint" className="mt-1 text-xs text-white/60">
                At least 10 characters.
              </p>
            )}
          </div>
          {error && (
            <p id="si-err" role="alert" className="border border-white/40 px-3 py-2 text-sm">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!email || password.length < (mode === "sign-up" ? 10 : 1) || busy !== null}
            className="inline-flex min-h-12 w-full items-center justify-center gap-3 bg-white text-[12px] font-medium uppercase tracking-[0.2em] text-sx-black disabled:opacity-50"
          >
            {busy === "email" && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/60">
          <span className="h-px flex-1 bg-white/15" />
          or
          <span className="h-px flex-1 bg-white/15" />
        </div>
        <button
          type="button"
          onClick={() => void google()}
          disabled={busy !== null}
          className="inline-flex min-h-12 w-full items-center justify-center gap-3 border border-white/40 text-[12px] font-medium uppercase tracking-[0.2em] hover:border-white disabled:opacity-50"
        >
          {busy === "google" && <Loader2 aria-hidden className="size-4 animate-spin" />}
          Continue with Google
        </button>
        <p className="mt-8 text-xs text-white/60">
          Looking to join?{" "}
          <Link href="/crew/apply" className="text-white underline underline-offset-4">
            Apply to Sanctuary LV Group
          </Link>{" "}
          or{" "}
          <Link href="/serve" className="text-white underline underline-offset-4">
            the nonprofit Serve Team
          </Link>
          .
        </p>
        <LegalLinks className="mt-4" keys={["privacy", "terms"]} />
      </div>
    </main>
  );
}

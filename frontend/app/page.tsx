"use client";

import { FormEvent, useEffect, useState } from "react";

type EmailResponse = {
  subject: string;
  email: string;
  provider: string;
};

type HistoryItem = {
  prompt: string;
  tone: string;
  purpose: string;
  subject: string;
  email: string;
  provider: string;
};

type PromptSuggestion = {
  label: string;
  prompt: string;
};

type PromptIdeasResponse = {
  ideas: PromptSuggestion[];
};

const tones = ["Professional", "Friendly", "Formal", "Casual"] as const;
const purposes = [
  "Interview Follow-up",
  "Leave Request",
  "Cold Outreach",
  "Client Update",
  "Apology Email",
  "Custom",
] as const;

type Tone = (typeof tones)[number];
type Purpose = (typeof purposes)[number];

const defaultPromptSuggestions: PromptSuggestion[] = [
  {
    label: "Follow up after an interview",
    prompt:
      "Write a follow-up email after my interview for a Full Stack AI Developer role.",
  },
  {
    label: "Request leave for tomorrow",
    prompt: "Write a leave request email for tomorrow due to personal work.",
  },
  {
    label: "Cold outreach for a SaaS product",
    prompt:
      "Write a cold outreach email for a SaaS product that helps teams automate reporting.",
  },
  {
    label: "Thank a client for a meeting",
    prompt:
      "Write a thank-you email after a productive client meeting about a new project.",
  },
  {
    label: "Apologize for a delayed response",
    prompt:
      "Write an apology email for replying late to an important business message.",
  },
];

const ideaSkeletonWidths = ["w-44", "w-40", "w-48", "w-36", "w-44"];
const ideaRefreshMinimumMs = 700;

const refineActions = [
  {
    id: "shorten",
    label: "Make shorter",
    loadingLabel: "Shortening...",
    description: "Make it tighter and easier to scan.",
  },
  {
    id: "elaborate",
    label: "Elaborate",
    loadingLabel: "Elaborating...",
    description: "Add more context and warmth.",
  },
  {
    id: "regenerate",
    label: "Rewrite",
    loadingLabel: "Rewriting...",
    description: "Create a stronger fresh version.",
  },
] as const;

type RefineAction = (typeof refineActions)[number]["id"];

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLanHost = host !== "localhost" && host !== "127.0.0.1";

    if (isLanHost) {
      return `http://${host}:8000`;
    }
  }

  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");
  const [purpose, setPurpose] = useState<Purpose>("Interview Follow-up");
  const [result, setResult] = useState<EmailResponse | null>(null);
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [refiningAction, setRefiningAction] = useState<RefineAction | null>(
    null,
  );
  const [openDropdown, setOpenDropdown] = useState<"tone" | "purpose" | null>(
    null,
  );
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [promptSuggestions, setPromptSuggestions] = useState<PromptSuggestion[]>(
    defaultPromptSuggestions,
  );
  const [ideasRefreshing, setIdeasRefreshing] = useState(false);

  const wordCount = result
    ? countWords(`${result.subject} ${result.email}`)
    : 0;

  useEffect(() => {
    let active = true;

    async function refreshPromptIdeas() {
      const apiBaseUrl = getApiBaseUrl();
      const startedAt = Date.now();

      if (active) {
        setIdeasRefreshing(true);
      }

      try {
        const response = await fetch(
          `${apiBaseUrl.replace(/\/$/, "")}/prompt-ideas`,
        );

        if (!response.ok) {
          throw new Error("Unable to refresh prompt ideas.");
        }

        const data = (await response.json()) as PromptIdeasResponse;

        if (active && Array.isArray(data.ideas) && data.ideas.length > 0) {
          setPromptSuggestions(data.ideas.slice(0, 5));
        }
      } catch {
        // Keep the previous ideas visible if Groq is temporarily unavailable.
      } finally {
        const remainingDelay = ideaRefreshMinimumMs - (Date.now() - startedAt);

        if (remainingDelay > 0) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, remainingDelay),
          );
        }

        if (active) {
          setIdeasRefreshing(false);
        }
      }
    }

    refreshPromptIdeas();
    const intervalId = window.setInterval(refreshPromptIdeas, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (deleteIndex === null) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [deleteIndex]);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const apiBaseUrl = getApiBaseUrl();
    const cleanedPrompt = prompt.trim();

    setError("");
    setCopied(false);
    setRefiningAction(null);
    setOpenDropdown(null);

    if (!apiBaseUrl) {
      setResult(null);
      setError("Frontend API URL is missing. Please set NEXT_PUBLIC_API_URL.");
      return;
    }

    if (cleanedPrompt.length < 5) {
      setResult(null);
      setError("Please enter at least 5 characters for the email idea.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        `${apiBaseUrl.replace(/\/$/, "")}/generate-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: cleanedPrompt,
            tone,
            purpose,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          errorBody?.detail ||
            "Unable to generate email. Please check your backend or API key and try again.",
        );
      }

      const data = (await response.json()) as EmailResponse;

      if (!data.subject || !data.email || !data.provider) {
        throw new Error("The backend returned an incomplete email response.");
      }

      setResult(data);
      setRecentHistory((items) =>
        [
          {
            prompt: cleanedPrompt,
            tone,
            purpose,
            subject: data.subject,
            email: data.email,
            provider: data.provider,
          },
          ...items,
        ].slice(0, 5),
      );
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Unable to generate email. Please check your backend or API key and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRefine(action: RefineAction) {
    if (!result) {
      return;
    }

    const apiBaseUrl = getApiBaseUrl();
    const selectedAction = refineActions.find((item) => item.id === action);

    setError("");
    setCopied(false);

    if (!apiBaseUrl) {
      setError("Frontend API URL is missing. Please set NEXT_PUBLIC_API_URL.");
      return;
    }

    setRefiningAction(action);

    try {
      const response = await fetch(
        `${apiBaseUrl.replace(/\/$/, "")}/refine-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject: result.subject,
            email: result.email,
            tone,
            purpose,
            action,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        if (response.status === 404) {
          throw new Error(
            "Edit endpoint not found. Restart the backend server so /refine-email is loaded.",
          );
        }
        throw new Error(
          errorBody?.detail ||
            "Unable to edit email. Please check your backend or API key and try again.",
        );
      }

      const data = (await response.json()) as EmailResponse;

      if (!data.subject || !data.email || !data.provider) {
        throw new Error("The backend returned an incomplete email response.");
      }

      setResult(data);
      setRecentHistory((items) =>
        [
          {
            prompt: `${selectedAction?.label || "Edit"}: ${result.subject}`,
            tone,
            purpose,
            subject: data.subject,
            email: data.email,
            provider: data.provider,
          },
          ...items,
        ].slice(0, 5),
      );
    } catch (refineError) {
      setError(
        refineError instanceof Error
          ? refineError.message
          : "Unable to edit email. Please check your backend or API key and try again.",
      );
    } finally {
      setRefiningAction(null);
    }
  }

  async function handleCopy() {
    if (!result) {
      return;
    }

    await navigator.clipboard.writeText(
      `Subject: ${result.subject}\n\n${result.email}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function handleConfirmDelete() {
    if (deleteIndex === null) {
      return;
    }

    setRecentHistory((items) =>
      items.filter((_, index) => index !== deleteIndex),
    );
    setDeleteIndex(null);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(34,211,238,0.22),transparent_26%),radial-gradient(circle_at_78%_0%,rgba(59,130,246,0.18),transparent_30%),radial-gradient(circle_at_72%_72%,rgba(124,58,237,0.18),transparent_34%),linear-gradient(135deg,#020617_0%,#0b1224_44%,#17113f_100%)]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-40 bg-gradient-to-b from-cyan-300/10 to-transparent" />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-7">
        <header className="flex flex-col gap-4 py-5 sm:py-8">
          <div className="w-fit rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100 shadow-lg shadow-cyan-950/20">
            AI POWERED EMAIL ASSISTANT
          </div>
          <div className="flex flex-col gap-3 lg:max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              PostMail AI
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-xl">
              Turn rough thoughts into ready-to-send emails.
            </p>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <form
            onSubmit={handleGenerate}
            className="self-start rounded-lg border border-white/10 bg-slate-900/60 p-5 shadow-2xl shadow-slate-950/50 backdrop-blur-xl sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">
                Create Your Email
              </h2>
            </div>

            <div className="mt-5 flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-200">
                  Email idea or topic
                </span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  maxLength={500}
                  rows={7}
                  placeholder="Example: Write a follow-up email after my interview for a Full Stack AI Developer role."
                  className="min-h-40 resize-y rounded-lg border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-white shadow-inner shadow-slate-950/40 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                />
                <span className="text-xs text-slate-400">
                  {prompt.trim().length}/500 characters
                </span>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <div
                  className="relative flex flex-col gap-2"
                  onBlur={(event) => {
                    const nextFocus = event.relatedTarget as Node | null;
                    if (
                      !nextFocus ||
                      !event.currentTarget.contains(nextFocus)
                    ) {
                      setOpenDropdown(null);
                    }
                  }}
                >
                  <span className="text-sm font-medium text-slate-200">
                    Tone
                  </span>
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={openDropdown === "tone"}
                    onClick={() =>
                      setOpenDropdown((current) =>
                        current === "tone" ? null : "tone",
                      )
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/70 px-4 py-3 text-left text-sm font-medium text-white shadow-inner shadow-slate-950/30 outline-none transition hover:border-cyan-300/40 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                  >
                    <span>{tone}</span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className={`h-4 w-4 text-slate-400 transition ${
                        openDropdown === "tone" ? "rotate-180" : ""
                      }`}
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {openDropdown === "tone" && (
                    <div
                      role="listbox"
                    className="absolute left-0 right-0 top-full z-40 mt-2 max-h-56 overflow-y-auto rounded-lg border border-cyan-300/20 bg-slate-950/95 p-1 shadow-2xl shadow-slate-950/50 backdrop-blur-xl"
                    >
                      {tones.map((item) => (
                        <button
                          key={item}
                          type="button"
                          role="option"
                          aria-selected={tone === item}
                          onClick={() => {
                            setTone(item);
                            setOpenDropdown(null);
                          }}
                          className={`block w-full rounded-md px-4 py-3 text-left text-sm transition ${
                            tone === item
                              ? "bg-cyan-300/15 text-cyan-50"
                              : "text-slate-200 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className="relative flex flex-col gap-2"
                  onBlur={(event) => {
                    const nextFocus = event.relatedTarget as Node | null;
                    if (
                      !nextFocus ||
                      !event.currentTarget.contains(nextFocus)
                    ) {
                      setOpenDropdown(null);
                    }
                  }}
                >
                  <span className="text-sm font-medium text-slate-200">
                    Purpose
                  </span>
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={openDropdown === "purpose"}
                    onClick={() =>
                      setOpenDropdown((current) =>
                        current === "purpose" ? null : "purpose",
                      )
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/70 px-4 py-3 text-left text-sm font-medium text-white shadow-inner shadow-slate-950/30 outline-none transition hover:border-cyan-300/40 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
                  >
                    <span className="truncate">{purpose}</span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className={`h-4 w-4 shrink-0 text-slate-400 transition ${
                        openDropdown === "purpose" ? "rotate-180" : ""
                      }`}
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {openDropdown === "purpose" && (
                    <div
                      role="listbox"
                    className="absolute left-0 right-0 top-full z-40 mt-2 max-h-56 overflow-y-auto rounded-lg border border-cyan-300/20 bg-slate-950/95 p-1 shadow-2xl shadow-slate-950/50 backdrop-blur-xl"
                    >
                      {purposes.map((item) => (
                        <button
                          key={item}
                          type="button"
                          role="option"
                          aria-selected={purpose === item}
                          onClick={() => {
                            setPurpose(item);
                            setOpenDropdown(null);
                          }}
                          className={`block w-full rounded-md px-4 py-3 text-left text-sm transition ${
                            purpose === item
                              ? "bg-cyan-300/15 text-cyan-50"
                              : "text-slate-200 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:from-cyan-200 hover:to-blue-400 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-70"
              >
                {loading ? "Generating..." : "Generate Email"}
              </button>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-200">
                  Try these ideas
                </h3>
                {ideasRefreshing && (
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-100">
                    Generating new ideas...
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {ideasRefreshing
                  ? ideaSkeletonWidths.map((width, index) => (
                      <div
                        key={`idea-loading-${index}`}
                        className={`${width} h-10 animate-pulse rounded-full border border-white/10 bg-white/10`}
                      />
                    ))
                  : promptSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.label}
                        type="button"
                        onClick={() => {
                          setPrompt(suggestion.prompt);
                          setError("");
                        }}
                        className="rounded-full border border-white/10 bg-white/10 px-3.5 py-2 text-left text-xs font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-50"
                      >
                        {suggestion.label}
                      </button>
                    ))}
              </div>
            </div>
          </form>

          <section className="rounded-lg border border-white/10 bg-slate-900/60 p-5 shadow-2xl shadow-slate-950/50 backdrop-blur-xl sm:p-6 lg:min-h-[560px]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">
                AI Draft Preview
              </h2>
            </div>

            <div className="mt-5">
              {loading && (
                <div className="flex min-h-[420px] flex-col justify-center gap-5 rounded-lg border border-white/10 bg-white/[0.03] p-5">
                  <div>
                    <p className="text-lg font-semibold text-white">
                      Crafting your email...
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      Creating a concise subject and ready-to-send body.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="h-4 w-3/4 animate-pulse rounded-full bg-white/15" />
                    <div className="h-4 w-full animate-pulse rounded-full bg-white/15" />
                    <div className="h-4 w-5/6 animate-pulse rounded-full bg-white/15" />
                  </div>
                </div>
              )}

              {!loading && error && (
                <div className="rounded-lg border border-red-300/20 bg-red-400/10 p-4 text-sm text-red-100">
                  {error}
                </div>
              )}

              {!loading && !error && !result && (
                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-dashed border-cyan-300/20 bg-white/[0.03] px-6 text-center shadow-inner shadow-slate-950/30">
                  <p className="text-lg font-semibold text-white">
                    Your polished email will appear here.
                  </p>
                  <p className="mt-2 max-w-sm text-sm text-slate-400">
                    Enter an idea, choose a tone, and let AI craft the first
                    draft.
                  </p>
                </div>
              )}

              {!loading && !error && result && (
                <div className="flex flex-col gap-5">
                  <div>
                    <p className="text-sm font-medium text-cyan-100">
                      Subject
                    </p>
                    <h3 className="mt-2 rounded-lg border border-white/10 bg-slate-950/55 px-4 py-3 text-lg font-semibold text-white shadow-inner shadow-slate-950/30">
                      {result.subject}
                    </h3>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-cyan-100">Email</p>
                    <div className="mt-2 min-h-64 whitespace-pre-wrap rounded-lg border border-white/10 bg-slate-950/55 px-4 py-4 text-sm leading-7 text-slate-100 shadow-inner shadow-slate-950/30">
                      {result.email}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-white/10 pt-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span className="whitespace-nowrap rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                        Estimated {wordCount} words
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
                      {refineActions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => handleRefine(action.id)}
                          disabled={loading || refiningAction !== null}
                          title={action.description}
                          className="whitespace-nowrap rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {refiningAction === action.id
                            ? action.loadingLabel
                            : action.label}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={handleCopy}
                        disabled={refiningAction !== null}
                        className="whitespace-nowrap rounded-lg border border-cyan-300/40 bg-cyan-300/15 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/25 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {copied ? "Copied!" : "Copy email"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </section>

        <section className="pb-8">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-xl font-semibold text-white">
              Recent Generations
            </h2>
            <p className="text-sm text-slate-400">
              Last 5 emails from this browser session.
            </p>
          </div>

          {recentHistory.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-400">
              No recent generations yet.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recentHistory.map((item, index) => (
                <article
                  key={`${item.subject}-${index}`}
                  className="relative min-w-0 rounded-lg border border-white/10 bg-white/10 p-4 pr-12 shadow-lg shadow-slate-950/30 backdrop-blur"
                >
                  <button
                    type="button"
                    onClick={() => setDeleteIndex(index)}
                    aria-label="Delete recent generation"
                    title="Delete"
                    className="absolute right-3 top-3 rounded-lg border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:border-red-300/30 hover:bg-red-400/10 hover:text-red-100"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 16H6L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">
                      {item.tone}
                    </span>
                    <span className="rounded-lg border border-blue-300/20 bg-blue-300/10 px-2 py-1 text-xs text-blue-100">
                      {item.purpose}
                    </span>
                  </div>
                  <h3 className="line-clamp-2 text-sm font-semibold text-white">
                    {item.subject}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">
                    {item.prompt}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {deleteIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-md"
        >
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-white/10 bg-slate-900/95 shadow-2xl shadow-slate-950/70">
            <div className="h-1 bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400" />
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-red-300/20 bg-red-400/10 text-red-100">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 16H6L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h2
                    id="delete-modal-title"
                    className="text-lg font-semibold text-white"
                  >
                    Delete this draft?
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Are you sure you want to remove this recent generation from
                    your history?
                  </p>
                </div>
              </div>

            {recentHistory[deleteIndex] && (
              <div className="mt-5 rounded-lg border border-white/10 bg-slate-950/50 p-4">
                <p className="line-clamp-2 text-sm font-semibold text-white">
                  {recentHistory[deleteIndex].subject}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                  {recentHistory[deleteIndex].prompt}
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteIndex(null)}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-lg border border-red-300/30 bg-red-400/15 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-400/25"
              >
                Delete draft
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

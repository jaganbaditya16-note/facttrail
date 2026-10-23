"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type SourceStatus = "Watching" | "Needs review" | "Pending connection";

type Source = {
  id: string;
  name: string;
  category: string;
  url: string;
  deadline: string;
  status: SourceStatus;
  initials: string;
};

type FactField = "deadline" | "eligibility" | "fee";

type ExtractedFact = {
  value: string | null;
  evidence: string | null;
  status: "supported" | "needs_review" | "not_found";
};

type ExtractionResponse = {
  model?: string;
  error?: string;
  disclaimer?: string;
  facts?: Record<FactField, ExtractedFact>;
};
type ChangeEvent = {
  id: number;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  detectedAt: string;
  previousDetectedAt: string | null;
  previousText: string | null;
  currentText: string;
  previousHash: string;
  currentHash: string;
};
type FetchSourceResponse = {
  title?: string;
  text?: string;
  error?: string;
  fetchedAt?: string;
  contentType?: string;
  truncated?: boolean;
};
const sampleSources: Source[] = [
  {
    id: "sample-1",
    name: "Open Source Fellowship",
    category: "Fellowship",
    url: "https://example.org/fellowship",
    deadline: "15 Nov 2026",
    status: "Needs review",
    initials: "OF",
  },
  {
    id: "sample-2",
    name: "Campus Innovation Grant",
    category: "Grant",
    url: "https://example.org/grant",
    deadline: "02 Dec 2026",
    status: "Watching",
    initials: "CI",
  },
  {
    id: "sample-3",
    name: "Global AI Build Week",
    category: "Hackathon",
    url: "https://example.org/hackathon",
    deadline: "Not extracted",
    status: "Pending connection",
    initials: "AI",
  },
  {
    id: "sample-4",
    name: "Student Research Fund",
    category: "Funding",
    url: "https://example.org/research",
    deadline: "30 Nov 2026",
    status: "Watching",
    initials: "SR",
  },
];

const navItems = [
  { label: "Overview", mark: "O", active: true },
  { label: "Sources", mark: "S", active: false },
  { label: "Change history", mark: "H", active: false },
  { label: "Evidence library", mark: "E", active: false },
];

function statusStyle(status: SourceStatus) {
  if (status === "Needs review") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "Watching") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

export default function Home() {
  const [sources, setSources] = useState<Source[]>(sampleSources);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [savingSource, setSavingSource] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [notice, setNotice] = useState("");

  const [sourceText, setSourceText] = useState(
    "Applications close on 15 November 2026.\nUndergraduate students may apply.\nThe application fee is zero.",
  );
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState("");
  const [extractionResult, setExtractionResult] =
    useState<ExtractionResponse | null>(null);
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>([]);
  const [loadingChangeHistory, setLoadingChangeHistory] = useState(true);
  const [changeHistoryError, setChangeHistoryError] = useState("");
  const [recheckingSourceId, setRecheckingSourceId] = useState<string | null>(null);
  const [recheckingAll, setRecheckingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedSources() {
      try {
        const response = await fetch("/api/sources", {
          cache: "no-store",
        });

        const payload = (await response.json()) as {
          sources?: Source[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Could not load saved sources.");
        }

        const savedSources = Array.isArray(payload.sources)
          ? payload.sources
          : [];

        if (cancelled || savedSources.length === 0) {
          return;
        }

        setSources((current) => {
          const savedIds = new Set(
            savedSources.map((source) => source.id),
          );

          return [
            ...savedSources,
            ...current.filter((source) => !savedIds.has(source.id)),
          ];
        });
      } catch (error: unknown) {
        if (!cancelled) {
          console.error("Could not load FactTrail saved sources.", error);
        }
      }
    }

    void loadSavedSources();

    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;

    async function loadChangeHistory() {
      setLoadingChangeHistory(true);

      try {
        const response = await fetch("/api/change-history", {
          cache: "no-store",
        });

        const payload = (await response.json()) as {
          changes?: ChangeEvent[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(
            payload.error || "Could not load change history.",
          );
        }

        if (!cancelled) {
          setChangeEvents(
            Array.isArray(payload.changes) ? payload.changes : [],
          );
          setChangeHistoryError("");
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setChangeEvents([]);
          setChangeHistoryError(
            error instanceof Error
              ? error.message
              : "Could not load change history.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingChangeHistory(false);
        }
      }
    }

    void loadChangeHistory();

    return () => {
      cancelled = true;
    };
  }, []);
  const filteredSources = useMemo(() => {
    const search = query.trim().toLowerCase();

    return sources.filter((source) => {
      const matchesSearch =
        !search ||
        source.name.toLowerCase().includes(search) ||
        source.category.toLowerCase().includes(search) ||
        source.url.toLowerCase().includes(search);

      const matchesFilter =
        filter === "All" || source.status === filter;

      return matchesSearch && matchesFilter;
    });
  }, [sources, query, filter]);

  async function handleAddSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSource(true);
    setSourceError("");
    setNotice("");
    setExtractionError("");
    setExtractionResult(null);

    try {
      const targetUrl = sourceUrl.trim();

      const fetchResponse = await fetch("/api/fetch-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });

      const fetched = (await fetchResponse.json()) as FetchSourceResponse;

      if (!fetchResponse.ok || !fetched.text?.trim()) {
        throw new Error(fetched.error || "Could not fetch readable source text.");
      }

      const extractionResponse = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fetched.text }),
      });

      const extracted = (await extractionResponse.json()) as ExtractionResponse;

      if (!extractionResponse.ok || !extracted.facts) {
        throw new Error(
          extracted.error || "The page was fetched, but fact extraction failed.",
        );
      }

      setSourceText(fetched.text);
      setExtractionResult(extracted);

      const fields = ["deadline", "eligibility", "fee"] as const;
      const needsReview = fields.some(
        (field) => extracted.facts?.[field]?.status !== "supported",
      );

      const displayName = sourceName.trim() || fetched.title || targetUrl;

      const newSource: Source = {
        id: `local-${Date.now()}`,
        name: displayName,
        category: "Program page",
        url: targetUrl,
        deadline: extracted.facts.deadline.value ?? "Not extracted",
        status: needsReview ? "Needs review" : "Pending connection",
        initials: displayName.slice(0, 2).toUpperCase(),
      };

      const saveResponse = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newSource,
          facts: extracted.facts,
          fetchedAt: fetched.fetchedAt ?? new Date().toISOString(),
        }),
      });

      const savedPayload = (await saveResponse.json()) as {
        source?: Source;
        error?: string;
      };

      if (!saveResponse.ok || !savedPayload.source) {
        throw new Error(
          savedPayload.error || "Extraction succeeded, but saving the source failed.",
        );
      }

      const persistedSource = savedPayload.source;

      let snapshotMessage = "";

      try {
        const snapshotResponse = await fetch("/api/snapshots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceId: persistedSource.id,
            text: fetched.text,
            fetchedAt: fetched.fetchedAt ?? new Date().toISOString(),
          }),
        });

        const snapshotPayload = (await snapshotResponse.json()) as {
          snapshot?: { changed: boolean };
          error?: string;
        };

        if (!snapshotResponse.ok || !snapshotPayload.snapshot) {
          throw new Error(
            snapshotPayload.error || "The initial snapshot could not be saved.",
          );
        }

        snapshotMessage = " Initial page snapshot saved.";
      } catch (snapshotError: unknown) {
        console.error(
          "Source saved, but initial snapshot recording failed.",
          snapshotError,
        );
        snapshotMessage =
          " Warning: the source was saved, but its initial snapshot could not be recorded.";
      }

      setSources((current) => [
        persistedSource,
        ...current.filter((source) => source.id !== persistedSource.id),
      ]);
      setSourceName("");
      setSourceUrl("");
      setShowAdd(false);
      setNotice(
        `Fetched "${displayName}" and attempted local fact extraction.${snapshotMessage} Automatic monitoring is not enabled yet.`,
      );
    } catch (error: unknown) {
      setSourceError(
        error instanceof Error ? error.message : "Unable to fetch this source.",
      );
    } finally {
      setSavingSource(false);
    }
  }

  async function handleRecheck(source: Source) {
    // The starter records are fictional, so they must not be rechecked.
    if (source.id.startsWith("sample-")) {
      setNotice("This is a fictional starter record. Add a real source before rechecking it.");
      return;
    }

    setRecheckingSourceId(source.id);
    setNotice("");

    try {
      const fetchResponse = await fetch("/api/fetch-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: source.url }),
      });

      const fetched = (await fetchResponse.json()) as FetchSourceResponse;

      if (!fetchResponse.ok || !fetched.text?.trim()) {
        throw new Error(
          fetched.error || "Could not fetch the saved source.",
        );
      }

      const snapshotResponse = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: source.id,
          text: fetched.text,
          fetchedAt: fetched.fetchedAt ?? new Date().toISOString(),
        }),
      });

      const snapshotPayload = (await snapshotResponse.json()) as {
        snapshot?: { changed: boolean };
        error?: string;
      };

      if (!snapshotResponse.ok || !snapshotPayload.snapshot) {
        throw new Error(
          snapshotPayload.error || "Could not save the new page snapshot.",
        );
      }

      let historyWarning = "";

      try {
        const historyResponse = await fetch("/api/change-history", {
          cache: "no-store",
        });

        const historyPayload = (await historyResponse.json()) as {
          changes?: ChangeEvent[];
          error?: string;
        };

        if (!historyResponse.ok) {
          throw new Error(
            historyPayload.error || "Could not refresh change history.",
          );
        }

        setChangeEvents(
          Array.isArray(historyPayload.changes)
            ? historyPayload.changes
            : [],
        );
        setChangeHistoryError("");
      } catch (historyError: unknown) {
        setChangeHistoryError(
          historyError instanceof Error
            ? historyError.message
            : "Could not refresh change history.",
        );
        historyWarning =
          " The snapshot was saved, but change history could not refresh. Reload the page to try again.";
      }

      setNotice(
        snapshotPayload.snapshot.changed
          ? `Rechecked "${source.name}": page content changed. Review Change history.${historyWarning}`
          : `Rechecked "${source.name}": no content change detected.${historyWarning}`,
      );
    } catch (error: unknown) {
      setNotice(
        `Recheck failed for "${source.name}": ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      );
    } finally {
      setRecheckingSourceId(null);
    }
  }
  async function handleRecheckAll() {
    if (recheckingSourceId !== null || recheckingAll) return;

    setRecheckingAll(true);
    setNotice("");

    try {
      const response = await fetch("/api/recheck-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      const payload = (await response.json()) as {
        total?: number;
        changed?: number;
        unchanged?: number;
        failed?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Batch recheck request failed.");
      }

      let historyWarning = "";

      try {
        const historyResponse = await fetch("/api/change-history", {
          cache: "no-store",
        });

        const historyPayload = (await historyResponse.json()) as {
          changes?: ChangeEvent[];
          error?: string;
        };

        if (!historyResponse.ok) {
          throw new Error(
            historyPayload.error || "Could not refresh change history.",
          );
        }

        setChangeEvents(
          Array.isArray(historyPayload.changes)
            ? historyPayload.changes
            : [],
        );
        setChangeHistoryError("");
      } catch (historyError: unknown) {
        setChangeHistoryError(
          historyError instanceof Error
            ? historyError.message
            : "Could not refresh change history.",
        );
        historyWarning =
          " Change history could not refresh; reload the page to try again.";
      }

      setNotice(
        `Rechecked ${payload.total ?? 0} saved source(s): ` +
          `${payload.changed ?? 0} changed, ` +
          `${payload.unchanged ?? 0} unchanged, ` +
          `${payload.failed ?? 0} failed. ` +
          `Review detected changes before acting.${historyWarning}`,
      );
    } catch (error: unknown) {
      setNotice(
        `Batch recheck failed: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      );
    } finally {
      setRecheckingAll(false);
    }
  }
  async function extractFacts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExtracting(true);
    setExtractionError("");
    setExtractionResult(null);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText }),
      });

      const payload = (await response.json()) as ExtractionResponse;

      if (!response.ok || !payload.facts) {
        throw new Error(payload.error || "Fact extraction failed.");
      }

      setExtractionResult(payload);
    } catch (error: unknown) {
      setExtractionError(
        error instanceof Error ? error.message : "Fact extraction failed.",
      );
    } finally {
      setExtracting(false);
    }
  }
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-[250px] shrink-0 flex-col border-r border-slate-200 bg-white px-5 py-6 md:flex">
          <a href="#" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-lg font-bold text-white">
              F
            </span>
            <span>
              <span className="block text-lg font-bold tracking-tight">
                FactTrail
              </span>
              <span className="block text-xs text-slate-500">
                Evidence-first tracking
              </span>
            </span>
          </a>

          <div className="mt-10">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Workspace
            </p>
            <nav className="space-y-1" aria-label="Main navigation">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={!item.active}
                  title={
                    item.active
                      ? "Current page"
                      : "This section has not been built yet"
                  }
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium ${
                    item.active
                      ? "bg-emerald-50 text-emerald-800"
                      : "cursor-not-allowed text-slate-400"
                  }`}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-current/10 text-xs">
                    {item.mark}
                  </span>
                  {item.label}
                  {!item.active && (
                    <span className="ml-auto text-[10px]">Soon</span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              <span className="text-xs font-semibold text-slate-700">
                Local Ollama active
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              FactTrail uses your local Ollama model for manual fact extraction. No paid AI API is used.
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 font-bold text-white md:hidden">
                F
              </span>
              <div>
                <p className="text-xs text-slate-500">Workspace / Overview</p>
                <h1 className="mt-1 text-lg font-bold tracking-tight sm:text-xl">
                  Your fact dashboard
                </h1>
              </div>
            </div>
            <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 sm:inline-flex">
              Prototype · Sample data
            </span>
          </header>

          <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-8">
            <section className="overflow-hidden rounded-2xl bg-[#123c32] p-6 text-white sm:p-8">
              <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
                    Know what changed
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                    Less checking.
                    <br />
                    More confidence in your next move.
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50/80">
                    Keep important deadlines, eligibility rules and application
                    requirements in one evidence-backed workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50"
                >
                  <span aria-hidden="true">+</span> Add a source
                </button>
              </div>
            </section>

            <div
              role="status"
              className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-800">
                i
              </span>
              <div>
                <p className="text-sm font-semibold text-amber-950">
                  Demonstration workspace
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-900/80">
                  The starter records below are fictional. Adding a source attempts
                  one public-page fetch and local AI extraction. Extracted facts require human review. Records are saved locally in SQLite; automatic checks and alerts are not implemented yet.
                </p>
              </div>
            </div>

            {notice && (
              <div
                role="status"
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
              >
                <span>{notice}</span>
                <button
                  type="button"
                  onClick={() => setNotice("")}
                  aria-label="Dismiss message"
                  className="text-slate-400 hover:text-slate-700"
                >
                  ×
                </button>
              </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div>
                <h2 className="text-lg font-semibold">Local AI fact extraction</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Paste text copied from a program page. FactTrail will extract
                  the deadline, eligibility and fee using your local Ollama model.
                </p>
              </div>

              <form onSubmit={extractFacts} className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">
                    Source text
                  </span>
                  <textarea
                    required
                    maxLength={12000}
                    rows={5}
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    placeholder="Paste text from the official source..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Runs locally · No paid AI API
                  </p>
                  <button
                    type="submit"
                    disabled={extracting || !sourceText.trim()}
                    className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {extracting ? "Extracting facts..." : "Extract facts"}
                  </button>
                </div>
              </form>

              {extractionError && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                >
                  {extractionError}
                </div>
              )}

              {extractionResult?.facts && (
                <div className="mt-6 space-y-4">
                  <div>
                    <h3 className="font-semibold">Extraction results</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Model: {extractionResult.model || "Local Ollama"}
                    </p>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    {(["deadline", "eligibility", "fee"] as const).map((field) => {
                      const fact = extractionResult.facts?.[field];
                      if (!fact) return null;

                      const statusClass =
                        fact.status === "supported"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : fact.status === "needs_review"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-slate-200 bg-slate-100 text-slate-700";

                      return (
                        <article
                          key={field}
                          className="min-w-0 rounded-xl border border-slate-200 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold capitalize">
                              {field}
                            </h4>
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass}`}
                            >
                              {fact.status.replace("_", " ")}
                            </span>
                          </div>
                          <p className="mt-3 break-words text-sm font-medium">
                            {fact.value ?? "No value extracted"}
                          </p>
                          <p className="mt-3 text-xs font-semibold text-slate-500">
                            Supporting text
                          </p>
                          <blockquote className="mt-1 break-words text-xs leading-5 text-slate-600">
                            {fact.evidence ?? "No supporting sentence returned."}
                          </blockquote>
                        </article>
                      );
                    })}
                  </div>

                  <p className="text-xs leading-5 text-slate-500">
                    {extractionResult.disclaimer}
                  </p>
                </div>
              )}
            </section>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">Tracked records</p>
                <p className="mt-3 text-3xl font-semibold">{sources.length}</p>
                <p className="mt-2 text-xs text-slate-400">
                  Sample and locally saved records
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">Needs review</p>
                <p className="mt-3 text-3xl font-semibold">
                  {sources.filter((s) => s.status === "Needs review").length}
                </p>
                <p className="mt-2 text-xs text-amber-700">
                  Sample status, not a live alert
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">Facts verified live</p>
                <p className="mt-3 text-3xl font-semibold">0</p>
                <p className="mt-2 text-xs text-slate-400">
                  Verification engine not connected
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">Monitoring status</p>
                <p className="mt-3 text-xl font-semibold">Not connected</p>
                <p className="mt-2 text-xs text-slate-400">
                  No automatic checks are running
                </p>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.9fr)]">
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold">Tracked sources</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Public programs you want to keep an eye on
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => void handleRecheckAll()}
                      disabled={recheckingAll || recheckingSourceId !== null}
                      className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {recheckingAll ? "Rechecking all..." : "Recheck all"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAdd(true)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                    >
                      + Add source
                    </button>
                  </div>
                </div>

                <div className="space-y-3 p-4 sm:p-5">
                  <label className="block">
                    <span className="sr-only">Search sources</span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search sources, categories or URLs..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    {["All", "Watching", "Needs review", "Pending connection"].map(
                      (option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setFilter(option)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                            filter === option
                              ? "border-emerald-800 bg-emerald-800 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {option}
                        </button>
                      )
                    )}
                  </div>

                  <div className="divide-y divide-slate-100">
                    {filteredSources.map((source) => (
                      <article key={source.id} className="flex gap-3 py-4">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                          {source.initials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                            <div className="min-w-0">
                              <h3 className="break-words text-sm font-semibold">
                                {source.name}
                              </h3>
                              <p className="mt-1 text-xs text-slate-500">
                                {source.category} · Demo record
                              </p>
                            </div>
                            <span
                              className={`self-start rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusStyle(source.status)}`}
                            >
                              {source.status}
                            </span>
                          </div>
                          <p className="mt-2 break-all text-xs text-slate-400">
                            {source.url}
                          </p>
                          <p className="mt-2 text-xs text-slate-600">
                            <span className="font-semibold">Deadline:</span>{" "}
                            {source.deadline}
                          </p>
                          {!source.id.startsWith("sample-") && (
                            <button
                              type="button"
                              onClick={() => void handleRecheck(source)}
                              disabled={recheckingSourceId !== null}
                              className="mt-3 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {recheckingSourceId === source.id
                                ? "Rechecking..."
                                : "Recheck now"}
                            </button>
                          )}
                        </div>
                      </article>
                    ))}

                    {filteredSources.length === 0 && (
                      <p className="py-10 text-center text-sm text-slate-500">
                        No sources match your search.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">Change history</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        Actual page differences recorded in local SQLite
                      </p>
                    </div>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                      {changeEvents.length} changes
                    </span>
                  </div>

                  <div className="mt-5 space-y-4">
                    {loadingChangeHistory ? (
                      <p className="py-6 text-center text-sm text-slate-500">
                        Loading saved changes...
                      </p>
                    ) : changeHistoryError ? (
                      <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
                        {changeHistoryError}
                      </p>
                    ) : changeEvents.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 p-5">
                        <p className="text-sm font-semibold text-slate-800">
                          No detected changes yet
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          The first saved snapshot establishes a baseline.
                          FactTrail needs a later fetch to compare page versions.
                          Automatic rechecks are not enabled yet.
                        </p>
                      </div>
                    ) : (
                      changeEvents.map((change) => (
                        <article
                          key={change.id}
                          className="rounded-xl border border-slate-200 p-4"
                        >
                          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                            <div className="min-w-0">
                              <h3 className="break-words text-sm font-semibold">
                                {change.sourceName}
                              </h3>
                              <p className="mt-1 break-all text-xs text-slate-500">
                                {change.sourceUrl}
                              </p>
                            </div>
                            <span className="self-start rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                              Change detected
                            </span>
                          </div>

                          <p className="mt-3 text-xs text-slate-500">
                            Detected at: {change.detectedAt}
                          </p>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="min-w-0 rounded-lg bg-slate-50 p-3">
                              <p className="text-xs font-semibold text-slate-500">
                                Previous version
                              </p>
                              <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                                {change.previousText ?? "Previous snapshot text unavailable."}
                              </p>
                            </div>
                            <div className="min-w-0 rounded-lg bg-slate-50 p-3">
                              <p className="text-xs font-semibold text-slate-500">
                                Current version
                              </p>
                              <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">
                                {change.currentText}
                              </p>
                            </div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="font-semibold">Build status</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    What works in this prototype today
                  </p>
                  <div className="mt-4 space-y-3">
                    {[
                      ["Dashboard interface", "Ready for testing", true],
                      ["Search and status filters", "Interactive", true],
                      ["Add source fetch + extraction", "One-time fetch; saved locally", true],
                      ["Local AI extraction", "Connected; manual action", true],
                      ["Live monitoring and alerts", "Not implemented", false],
                    ].map(([name, description, ready]) => (
                      <div key={String(name)} className="flex items-start gap-3">
                        <span
                          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                            ready
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {ready ? "✓" : "–"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </section>

            <footer className="border-t border-slate-200 py-5 text-xs leading-5 text-slate-400">
              FactTrail is an early prototype. Always confirm important
              deadlines and eligibility requirements against the original
              official source.
            </footer>
          </div>
        </main>
      </div>

      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowAdd(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-source-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="add-source-title" className="text-lg font-bold">
                  Add a source
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  FactTrail will fetch the page and extract facts locally. Automatic monitoring is not enabled yet.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close form"
                onClick={() => setShowAdd(false)}
                className="rounded-lg px-2 py-1 text-xl text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddSource} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Program name
                </span>
                <input
                  required
                  autoFocus
                  value={sourceName}
                  onChange={(event) => setSourceName(event.target.value)}
                  placeholder="e.g. Student innovation grant"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Official source URL
                </span>
                <input
                  required
                  type="url"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              {sourceError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {sourceError}
                </div>
              )}              <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                FactTrail fetches this page once and attempts local AI extraction.
                The record is saved in local SQLite on this computer and remains after refresh. Automatic monitoring is not enabled yet.
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSource}
                  className="rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {savingSource ? "Fetching and extracting..." : "Fetch and extract"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

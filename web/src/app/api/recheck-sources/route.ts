import { NextResponse } from "next/server";
import { POST as fetchSource } from "../fetch-source/route";
import { listSources, recordSnapshot } from "../../../lib/database";

type FetchResult = {
  text?: string;
  title?: string;
  fetchedAt?: string;
  error?: string;
};

type RecheckResult = {
  sourceId: string;
  name: string;
  status: "changed" | "unchanged" | "failed";
  message: string;
};

export async function POST() {
  try {
    // Only recheck saved records. Ignore fictional starter IDs.
    const sources = listSources()
      .filter((source) => !source.id.startsWith("sample-"))
      .slice(0, 50);

    const results: RecheckResult[] = [];

    // Sequential requests reduce load on target websites and local Ollama.
    for (const source of sources) {
      try {
        const fetchRequest = new Request(
          "http://facttrail.local/api/fetch-source",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: source.url }),
          },
        );

        const response = await fetchSource(fetchRequest);
        const fetched = (await response.json()) as FetchResult;

        if (!response.ok || !fetched.text?.trim()) {
          throw new Error(
            fetched.error || "The source returned no readable page text.",
          );
        }

        const snapshot = recordSnapshot(
          source.id,
          fetched.text,
          fetched.fetchedAt ?? new Date().toISOString(),
        );

        results.push({
          sourceId: source.id,
          name: source.name,
          status: snapshot.changed ? "changed" : "unchanged",
          message: snapshot.changed
            ? "Page content changed. Review the saved snapshots."
            : "No content change detected.",
        });
      } catch (error: unknown) {
        results.push({
          sourceId: source.id,
          name: source.name,
          status: "failed",
          message:
            error instanceof Error
              ? error.message
              : "The source could not be rechecked.",
        });
      }
    }

    return NextResponse.json({
      total: results.length,
      changed: results.filter((item) => item.status === "changed").length,
      unchanged: results.filter((item) => item.status === "unchanged").length,
      failed: results.filter((item) => item.status === "failed").length,
      results,
      disclaimer:
        "A content change does not necessarily mean a deadline or eligibility rule changed. Review the saved text before acting.",
    });
  } catch (error: unknown) {
    console.error("FactTrail batch recheck failed.", error);

    return NextResponse.json(
      { error: "Could not start the batch recheck." },
      { status: 500 },
    );
  }
}

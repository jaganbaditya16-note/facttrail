import { NextResponse } from "next/server";
import {
  listSnapshots,
  listSources,
  recordSnapshot,
} from "../../../lib/database";

export async function GET(request: Request) {
  const sourceId = new URL(request.url).searchParams.get("sourceId");

  if (!sourceId?.trim() || sourceId.length > 100) {
    return NextResponse.json(
      { error: "A valid sourceId query parameter is required." },
      { status: 400 },
    );
  }

  try {
    const sourceExists = listSources().some(
      (source) => source.id === sourceId,
    );

    if (!sourceExists) {
      return NextResponse.json(
        { error: "Source not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      snapshots: listSnapshots(sourceId),
    });
  } catch (error: unknown) {
    console.error("FactTrail snapshot read failed.", error);
    return NextResponse.json(
      { error: "Could not read source snapshots." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Snapshot data is required." },
      { status: 400 },
    );
  }

  const item = body as Record<string, unknown>;
  const { sourceId, text, fetchedAt } = item;

  if (
    typeof sourceId !== "string" ||
    !sourceId.trim() ||
    sourceId.length > 100 ||
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 12_000 ||
    (fetchedAt !== undefined &&
      (typeof fetchedAt !== "string" ||
        !Number.isFinite(Date.parse(fetchedAt))))
  ) {
    return NextResponse.json(
      { error: "Provide a sourceId, readable text up to 12000 characters, and an optional valid timestamp." },
      { status: 400 },
    );
  }

  try {
    const sourceExists = listSources().some(
      (source) => source.id === sourceId,
    );

    if (!sourceExists) {
      return NextResponse.json(
        { error: "Source not found. Save the source before recording a snapshot." },
        { status: 404 },
      );
    }

    const snapshot = recordSnapshot(
      sourceId,
      text,
      typeof fetchedAt === "string"
        ? fetchedAt
        : new Date().toISOString(),
    );

    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (error: unknown) {
    console.error("FactTrail snapshot write failed.", error);
    return NextResponse.json(
      { error: "Could not record this source snapshot." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import {
  listSources,
  saveSource,
  type StoredSourceStatus,
} from "../../../lib/database";

const allowedStatuses: StoredSourceStatus[] = [
  "Watching",
  "Needs review",
  "Pending connection",
];

export async function GET() {
  try {
    return NextResponse.json({ sources: listSources() });
  } catch (error: unknown) {
    console.error("FactTrail source database read failed.", error);
    return NextResponse.json(
      { error: "Could not read local source records." },
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
      { error: "A source record is required." },
      { status: 400 },
    );
  }

  const item = body as Record<string, unknown>;
  const { id, name, category, url, deadline, status, initials } = item;

  if (
    typeof id !== "string" || !id.trim() || id.length > 100 ||
    typeof name !== "string" || !name.trim() || name.length > 200 ||
    typeof category !== "string" || !category.trim() || category.length > 80 ||
    typeof url !== "string" || url.length > 2048 ||
    typeof deadline !== "string" || deadline.length > 200 ||
    typeof status !== "string" ||
    !allowedStatuses.includes(status as StoredSourceStatus) ||
    typeof initials !== "string" || initials.length > 4
  ) {
    return NextResponse.json(
      { error: "The source record contains missing or invalid fields." },
      { status: 400 },
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json(
      { error: "The source URL is invalid." },
      { status: 400 },
    );
  }

  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    return NextResponse.json(
      { error: "Only HTTP and HTTPS source URLs without credentials are allowed." },
      { status: 400 },
    );
  }

  const rawFacts = item.facts;
  const facts =
    rawFacts && typeof rawFacts === "object" && !Array.isArray(rawFacts)
      ? rawFacts as Record<string, unknown>
      : {};

  const fetchedAt =
    typeof item.fetchedAt === "string" &&
    Number.isFinite(Date.parse(item.fetchedAt))
      ? new Date(item.fetchedAt).toISOString()
      : new Date().toISOString();

  try {
    const source = saveSource({
      id: id.trim(),
      name: name.trim(),
      category: category.trim(),
      url,
      deadline,
      status: status as StoredSourceStatus,
      initials,
      facts,
      fetchedAt,
    });

    return NextResponse.json({ source }, { status: 201 });
  } catch (error: unknown) {
    console.error("FactTrail source database write failed.", error);
    return NextResponse.json(
      { error: "Could not save the source to the local database." },
      { status: 500 },
    );
  }
}

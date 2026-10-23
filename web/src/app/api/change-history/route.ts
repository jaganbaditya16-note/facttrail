import { NextResponse } from "next/server";
import { listChangeEvents } from "../../../lib/database";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json(
      { error: "Limit must be a whole number from 1 to 100." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({
      changes: listChangeEvents(limit),
    });
  } catch (error: unknown) {
    console.error("FactTrail change-history read failed.", error);
    return NextResponse.json(
      { error: "Could not read change history." },
      { status: 500 },
    );
  }
}

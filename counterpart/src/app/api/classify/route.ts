import { NextResponse } from "next/server";
import { runClassifier, type ClassifierMessage } from "@/lib/classifier";

function isMessage(value: unknown): value is ClassifierMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string"
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messages?: unknown };

    if (!Array.isArray(body.messages) || !body.messages.every(isMessage)) {
      return NextResponse.json(
        { error: "Expected messages to be an array of {role, content} objects." },
        { status: 400 },
      );
    }

    const scores = await runClassifier(body.messages);

    if (!scores) {
      return NextResponse.json(
        { error: "No user messages to classify." },
        { status: 400 },
      );
    }

    return NextResponse.json(scores);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Classification failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

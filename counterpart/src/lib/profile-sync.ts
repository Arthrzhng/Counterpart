import { getSupabaseClient } from "./supabase";
import type { DimensionScores } from "./classifier";

// SQL to create the table in your Supabase project:
//
// create table user_profiles (
//   session_id text primary key,
//   abstract_vs_concrete float8,
//   validation_vs_truth float8,
//   divergent_vs_convergent float8,
//   cautious_vs_decisive float8,
//   conflict_avoidant_vs_direct float8,
//   knowledge_confidence float8
// );

type ProfileRow = {
  abstract_vs_concrete: number | null;
  validation_vs_truth: number | null;
  divergent_vs_convergent: number | null;
  cautious_vs_decisive: number | null;
  conflict_avoidant_vs_direct: number | null;
  knowledge_confidence: number | null;
};

export async function fetchProfile(sessionId: string): Promise<DimensionScores | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from("user_profiles")
    .select(
      "abstract_vs_concrete, validation_vs_truth, divergent_vs_convergent, cautious_vs_decisive, conflict_avoidant_vs_direct, knowledge_confidence",
    )
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as ProfileRow;
  return {
    abstract_vs_concrete: row.abstract_vs_concrete,
    validation_vs_truth: row.validation_vs_truth,
    divergent_vs_convergent: row.divergent_vs_convergent,
    cautious_vs_decisive: row.cautious_vs_decisive,
    conflict_avoidant_vs_direct: row.conflict_avoidant_vs_direct,
    knowledge_confidence: row.knowledge_confidence,
  };
}

export async function upsertProfile(sessionId: string, scores: DimensionScores): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;

  await sb.from("user_profiles").upsert(
    {
      session_id: sessionId,
      abstract_vs_concrete: scores.abstract_vs_concrete,
      validation_vs_truth: scores.validation_vs_truth,
      divergent_vs_convergent: scores.divergent_vs_convergent,
      cautious_vs_decisive: scores.cautious_vs_decisive,
      conflict_avoidant_vs_direct: scores.conflict_avoidant_vs_direct,
      knowledge_confidence: scores.knowledge_confidence,
    },
    { onConflict: "session_id" },
  );
}

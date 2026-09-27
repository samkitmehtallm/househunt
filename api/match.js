import { db } from "../lib/db.js";
import { matchListings } from "../lib/matcher.js";
import { summariseOptions } from "../lib/explain.js";

export default async function handler(req, res) {
  try {
    const supabase = db();
    const code = String(req.query.code || "").toUpperCase().trim();
    if (!code) {
      res.status(400).json({ error: "code is required" });
      return;
    }

    const { data: session, error: sErr } = await supabase.from("sessions").select("*").eq("code", code).single();
    if (sErr || !session) {
      res.status(404).json({ error: "No search found with that code" });
      return;
    }

    const { data: participants } = await supabase
      .from("participants")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });

    if (!participants || participants.length === 0) {
      res.status(200).json({ session, participants: [], shortlist: [], near_misses: [], message: "Nobody has filled the form in yet." });
      return;
    }

    const [{ data: listings }, { data: commutes }] = await Promise.all([
      supabase.from("listings").select("*").eq("city", session.city),
      supabase.from("commutes").select("*"),
    ]);

    const result = matchListings(listings || [], participants, commutes || [], 3);
    const summaries = await summariseOptions(result.shortlist);

    const shortlist = result.shortlist.map((option, i) => ({ ...option, summary: summaries[i] || null }));

    // Persist what the group was shown, so the shortlist they discussed is on record
    // rather than living only in someone's scrollback.
    await supabase.from("results").delete().eq("session_id", session.id);
    if (shortlist.length) {
      await supabase.from("results").insert(
        shortlist.map((o, i) => ({
          session_id: session.id,
          listing_id: o.listing.id,
          rank: i + 1,
          dealbreaker_count: o.dealbreaker_count,
          breakdown: o.breakdown,
          summary: o.summary,
        }))
      );
    }

    res.status(200).json({
      session,
      participants: participants.map((p) => ({ id: p.id, name: p.name })),
      shortlist,
      near_misses: result.near_misses,
      viable_count: result.viable_count,
      evaluated: result.evaluated,
    });
  } catch (e) {
    console.error("match error:", e);
    res.status(500).json({ error: e.message });
  }
}

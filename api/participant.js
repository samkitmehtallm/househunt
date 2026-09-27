import { db } from "../lib/db.js";

const ALLOWED_FEATURES = ["lift", "parking", "pet_friendly", "furnished"];

function cleanFeatures(list) {
  return (Array.isArray(list) ? list : []).map(String).filter((f) => ALLOWED_FEATURES.includes(f));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const supabase = db();
    const {
      code,
      name,
      max_rent_share,
      work_location,
      max_commute_min,
      excluded_areas,
      must_haves,
      nice_to_haves,
      min_bathrooms,
    } = req.body || {};

    if (!code || !name || !max_rent_share) {
      res.status(400).json({ error: "Code, name and maximum rent share are required" });
      return;
    }

    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select("*")
      .eq("code", String(code).toUpperCase().trim())
      .single();
    if (sErr || !session) {
      res.status(404).json({ error: "No search found with that code" });
      return;
    }

    // A must-have can't also be a nice-to-have — if someone ticks both, the stricter
    // reading wins, since the entire point is that dealbreakers are unambiguous.
    const musts = cleanFeatures(must_haves);
    const nices = cleanFeatures(nice_to_haves).filter((f) => !musts.includes(f));

    const row = {
      session_id: session.id,
      name: String(name).trim(),
      max_rent_share: Number(max_rent_share),
      work_location: work_location ? String(work_location).trim() : null,
      max_commute_min: max_commute_min ? Number(max_commute_min) : null,
      excluded_areas: (Array.isArray(excluded_areas) ? excluded_areas : []).map((a) => String(a).trim()).filter(Boolean),
      must_haves: musts,
      nice_to_haves: nices,
      min_bathrooms: min_bathrooms ? Number(min_bathrooms) : 1,
    };

    // Re-submitting under the same name updates that person's answers instead of
    // creating a duplicate — people change their minds before the group sits down.
    const { data, error } = await supabase
      .from("participants")
      .upsert(row, { onConflict: "session_id,name" })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const { count } = await supabase
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id);

    res.status(200).json({ participant: data, participant_count: count || 0 });
  } catch (e) {
    console.error("participant error:", e);
    res.status(500).json({ error: e.message });
  }
}

import { db, makeCode } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    const supabase = db();

    if (req.method === "POST") {
      const { name, city } = req.body || {};
      if (!name || !String(name).trim()) {
        res.status(400).json({ error: "A name for the search is required" });
        return;
      }

      // Codes are random; on the rare collision, try again rather than fail the user.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeCode();
        const { data, error } = await supabase
          .from("sessions")
          .insert({ code, name: String(name).trim(), city: city || "Pune" })
          .select()
          .single();
        if (!error) {
          res.status(200).json({ session: data });
          return;
        }
        if (!String(error.message).includes("duplicate")) throw new Error(error.message);
      }
      throw new Error("Could not allocate a session code");
    }

    if (req.method === "GET") {
      const code = String(req.query.code || "").toUpperCase().trim();
      if (!code) {
        res.status(400).json({ error: "code is required" });
        return;
      }

      const { data: session, error } = await supabase.from("sessions").select("*").eq("code", code).single();
      if (error || !session) {
        res.status(404).json({ error: "No search found with that code" });
        return;
      }

      const { data: participants } = await supabase
        .from("participants")
        .select("*")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });

      res.status(200).json({ session, participants: participants || [] });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("session error:", e);
    res.status(500).json({ error: e.message });
  }
}

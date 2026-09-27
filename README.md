# Flat Search — constraints first, listings second

MESA AI-Native Track · Cohort C4 · Section B · L2 Assessment Part B

**Live:** https://flat-search-mesa.vercel.app
**Components map:** [`components-map.png`](components-map.png)

---

## The problem this solves

Riya, Meera and Kavita spent four months looking at flats and shortlisted nothing.
The issue was never a shortage of listings. It was that each listing got evaluated
one objection at a time, in a WhatsApp thread, *after* someone had already fallen
for it — so every round ended with somebody defensive and somebody guilty.

Nobody had ever written down what each person actually needs versus what they'd
merely prefer.

## What this does

Everyone fills in the same form **before anyone looks at a single listing**. The
tool then checks every listing against all three sets of constraints at once and
returns a shortlist where, for each option, you can see exactly who gets what and
who is compromising on what.

The single most important design decision: **dealbreakers and preferences are
stored and treated separately, and never conflated.**

- A **dealbreaker** removes a flat from the list entirely. Meera's lift, Riya's
  parking, Kavita's 40-minute commute ceiling.
- A **preference** never disqualifies anything. It shows up as a named compromise
  on the option card, so it's visible before the conversation starts.

It also shows the **nearest misses** with the specific reason each was ruled out —
so nobody spends another twenty-four hours on a flat that never qualified.

**The tool does not pick the flat.** That decision stays with the three of them.
It just makes sure the conversation is about which tradeoff they want, not about
whether a place is even eligible.

## Try it

1. Open the live URL, create a search, and share the 6-character code
2. Each person opens the link and submits their own constraints
3. Hit "See what qualifies"

## How it's built

```
index.html / styles.css / app.js   Three-screen front end: create/join → form → results
api/session.js                     Create a search, look one up by code
api/participant.js                 Submit or update one person's constraints
api/match.js                       Run the match, persist the shortlist
lib/matcher.js                     The constraint logic — deterministic, no LLM
lib/explain.js                     Gemini writes the one-line tradeoff summary
lib/db.js                          Supabase client
components-map.png / .svg          The components map
```

### Where the LLM sits, and where it deliberately doesn't

Gemini writes one neutral sentence per qualifying option naming the real tradeoff.
That's all.

It is **not** in the decision path. `matcher.js` decides what qualifies using
plain deterministic logic, because "does this flat have a lift" is not a judgment
call and shouldn't be answered probabilistically. If Gemini is rate-limited or
down, `lib/explain.js` falls back to a generated sentence and the app behaves
identically otherwise.

### Data

| Table | Holds |
|---|---|
| `sessions` | one group search + its share code |
| `participants` | each person's constraints — dealbreakers and preferences in separate columns |
| `listings` | the listing feed (16 seeded Pune listings) |
| `commutes` | area → work location, in minutes |
| `results` | the shortlist the group was actually shown |

The `listings` table stands in for a live 99acres/Housing feed and uses the same
shape one would return. Swapping in a real API touches only that table's source.

## Running locally

```bash
npm install
cp .env.example .env    # add your Supabase + Gemini keys
```

Needs `SUPABASE_URL` and `SUPABASE_KEY`. `GEMINI_API_KEY` is optional — without
it you get the deterministic tradeoff summaries instead.

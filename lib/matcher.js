// The core of the tool. Riya's problem was never a shortage of listings — it was that
// listings got evaluated one objection at a time, after someone had already fallen for a
// place. So this evaluates every listing against every person's constraints up front, and
// keeps dealbreakers and preferences strictly separate: a dealbreaker disqualifies, a
// preference is only ever a named compromise.

export const MUST_HAVE_LABELS = {
  lift: "Lift in building",
  parking: "Parking",
  pet_friendly: "Pet friendly",
  furnished: "Furnished",
};

function rentShare(listing, participantCount) {
  return Math.ceil(listing.rent_total / Math.max(participantCount, 1));
}

function hasFeature(listing, feature) {
  switch (feature) {
    case "lift":
      return listing.has_lift;
    case "parking":
      return listing.has_parking;
    case "pet_friendly":
      return listing.pet_friendly;
    case "furnished":
      return (listing.furnished || "").toLowerCase().includes("furnished");
    default:
      return false;
  }
}

function commuteMinutes(commutes, area, workLocation) {
  if (!workLocation) return null;
  const row = commutes.find(
    (c) => c.from_area.toLowerCase() === area.toLowerCase() && c.to_location.toLowerCase() === workLocation.toLowerCase()
  );
  return row ? row.minutes : null;
}

// Everything one person gets, gives up, or is blocked by on a single listing.
function evaluateForPerson(listing, person, participantCount, commutes) {
  const gets = [];
  const givesUp = [];
  const blockedBy = [];

  const share = rentShare(listing, participantCount);
  if (share > person.max_rent_share) {
    blockedBy.push(`Rent share ₹${share.toLocaleString("en-IN")} is over their ₹${person.max_rent_share.toLocaleString("en-IN")} limit`);
  } else {
    gets.push(`Rent share ₹${share.toLocaleString("en-IN")} (under their ₹${person.max_rent_share.toLocaleString("en-IN")} limit)`);
  }

  const excluded = (person.excluded_areas || []).map((a) => a.toLowerCase());
  if (excluded.includes(listing.area.toLowerCase())) {
    blockedBy.push(`${listing.area} is on their excluded list`);
  }

  const minutes = commuteMinutes(commutes, listing.area, person.work_location);
  if (person.max_commute_min && minutes !== null) {
    if (minutes > person.max_commute_min) {
      blockedBy.push(`${minutes} min to ${person.work_location} — over their ${person.max_commute_min} min limit`);
    } else {
      gets.push(`${minutes} min commute to ${person.work_location}`);
    }
  } else if (minutes !== null) {
    gets.push(`${minutes} min commute to ${person.work_location}`);
  }

  if (listing.bathrooms < person.min_bathrooms) {
    blockedBy.push(`${listing.bathrooms} bathroom(s), they need ${person.min_bathrooms}`);
  }

  for (const must of person.must_haves || []) {
    if (hasFeature(listing, must)) {
      gets.push(MUST_HAVE_LABELS[must] || must);
    } else {
      blockedBy.push(`No ${(MUST_HAVE_LABELS[must] || must).toLowerCase()} — this is a dealbreaker for them`);
    }
  }

  for (const nice of person.nice_to_haves || []) {
    if (hasFeature(listing, nice)) {
      gets.push(`${MUST_HAVE_LABELS[nice] || nice} (wanted, got it)`);
    } else {
      givesUp.push(MUST_HAVE_LABELS[nice] || nice);
    }
  }

  return {
    name: person.name,
    gets,
    gives_up: givesUp,
    blocked_by: blockedBy,
    qualifies: blockedBy.length === 0,
  };
}

export function matchListings(listings, participants, commutes, limit = 3) {
  const count = participants.length;

  const scored = listings.map((listing) => {
    const breakdown = participants.map((p) => evaluateForPerson(listing, p, count, commutes));
    const dealbreakerCount = breakdown.reduce((n, b) => n + b.blocked_by.length, 0);
    const compromiseCount = breakdown.reduce((n, b) => n + b.gives_up.length, 0);
    const blockedPeople = breakdown.filter((b) => !b.qualifies).map((b) => b.name);

    return {
      listing,
      breakdown,
      dealbreaker_count: dealbreakerCount,
      compromise_count: compromiseCount,
      blocked_people: blockedPeople,
      works_for_everyone: dealbreakerCount === 0,
    };
  });

  // Fewest dealbreakers first, then fewest compromises, then cheapest. A place that
  // works for everyone always outranks a cheaper one that blocks somebody.
  scored.sort(
    (a, b) =>
      a.dealbreaker_count - b.dealbreaker_count ||
      a.compromise_count - b.compromise_count ||
      a.listing.rent_total - b.listing.rent_total
  );

  const viable = scored.filter((s) => s.works_for_everyone);

  return {
    // Only ever shortlist places that clear everyone's dealbreakers — that is the whole
    // point. If there aren't enough, say so rather than padding the list.
    shortlist: viable.slice(0, limit),
    viable_count: viable.length,
    // The nearest misses, so the group can see what a small change would unlock.
    near_misses: scored.filter((s) => !s.works_for_everyone).slice(0, 3),
    evaluated: scored.length,
  };
}

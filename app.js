const AREAS = [
  "Baner", "Wakad", "Hinjewadi", "Kothrud", "Aundh", "Balewadi",
  "Pimple Saudagar", "Bavdhan", "Viman Nagar", "Kharadi", "Karve Nagar", "Warje", "Hadapsar",
];

const FEATURES = [
  { id: "lift", label: "Lift in building" },
  { id: "parking", label: "Parking" },
  { id: "pet_friendly", label: "Pet friendly" },
  { id: "furnished", label: "Furnished" },
];

const $ = (id) => document.getElementById(id);
let currentCode = null;

function show(view) {
  for (const v of ["home", "form", "results"]) $(`view-${v}`).hidden = v !== view;
  window.scrollTo(0, 0);
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}

function chip(container, id, label, group) {
  const wrapper = document.createElement("label");
  wrapper.className = "chip";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.value = id;
  box.dataset.group = group;
  box.addEventListener("change", () => wrapper.classList.toggle("on", box.checked));
  wrapper.append(box, document.createTextNode(label));
  container.appendChild(wrapper);
}

function buildChips() {
  const areas = $("areas-list");
  const musts = $("must-list");
  const nices = $("nice-list");
  areas.innerHTML = musts.innerHTML = nices.innerHTML = "";
  AREAS.forEach((a) => chip(areas, a, a, "area"));
  FEATURES.forEach((f) => chip(musts, f.id, f.label, "must"));
  FEATURES.forEach((f) => chip(nices, f.id, f.label, "nice"));
}

function selected(group) {
  return [...document.querySelectorAll(`input[data-group="${group}"]:checked`)].map((i) => i.value);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

// ---------- home ----------
$("btn-create").addEventListener("click", async () => {
  const name = $("session-name").value.trim();
  showError($("home-error"), "");
  if (!name) return showError($("home-error"), "Give the search a name first.");

  try {
    $("btn-create").disabled = true;
    const { session } = await api("/api/session", { method: "POST", body: JSON.stringify({ name }) });
    enterSession(session.code);
  } catch (e) {
    showError($("home-error"), e.message);
  } finally {
    $("btn-create").disabled = false;
  }
});

$("btn-join").addEventListener("click", async () => {
  const code = $("join-code").value.trim().toUpperCase();
  showError($("home-error"), "");
  if (!code) return showError($("home-error"), "Enter the code you were given.");

  try {
    $("btn-join").disabled = true;
    await api(`/api/session?code=${encodeURIComponent(code)}`);
    enterSession(code);
  } catch (e) {
    showError($("home-error"), e.message);
  } finally {
    $("btn-join").disabled = false;
  }
});

async function enterSession(code) {
  currentCode = code;
  $("form-code").textContent = code;
  $("results-code").textContent = code;
  buildChips();
  show("form");
  await refreshParticipants();
  history.replaceState(null, "", `?code=${code}`);
}

$("btn-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentCode);
    $("btn-copy").textContent = "Copied";
    setTimeout(() => ($("btn-copy").textContent = "Copy code"), 1600);
  } catch {
    $("btn-copy").textContent = currentCode;
  }
});

// ---------- form ----------
async function refreshParticipants() {
  try {
    const { participants } = await api(`/api/session?code=${encodeURIComponent(currentCode)}`);
    const list = $("participants-list");
    list.innerHTML = "";
    if (!participants.length) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Nobody yet — you'll be the first.";
      list.appendChild(li);
    } else {
      participants.forEach((p) => {
        const li = document.createElement("li");
        li.textContent = `${p.name} — up to ₹${Number(p.max_rent_share).toLocaleString("en-IN")}/mo`;
        list.appendChild(li);
      });
    }
  } catch (e) {
    console.error(e);
  }
}

$("btn-submit").addEventListener("click", async () => {
  showError($("form-error"), "");
  const name = $("p-name").value.trim();
  const rent = $("p-rent").value;
  if (!name) return showError($("form-error"), "Your name is needed so the breakdown can show who gets what.");
  if (!rent) return showError($("form-error"), "Enter the most you can contribute per month.");

  const payload = {
    code: currentCode,
    name,
    max_rent_share: Number(rent),
    work_location: $("p-work").value || null,
    max_commute_min: $("p-commute").value ? Number($("p-commute").value) : null,
    excluded_areas: selected("area"),
    must_haves: selected("must"),
    nice_to_haves: selected("nice"),
    min_bathrooms: Number($("p-baths").value),
  };

  try {
    $("btn-submit").disabled = true;
    await api("/api/participant", { method: "POST", body: JSON.stringify(payload) });
    await refreshParticipants();
    $("btn-submit").textContent = "Saved — you can edit and resubmit";
    setTimeout(() => ($("btn-submit").textContent = "Submit my constraints"), 2500);
  } catch (e) {
    showError($("form-error"), e.message);
  } finally {
    $("btn-submit").disabled = false;
  }
});

// ---------- results ----------
$("btn-results").addEventListener("click", loadResults);
$("btn-back").addEventListener("click", () => show("form"));

function personBlock(person) {
  const el = document.createElement("div");
  el.className = "person";

  const name = document.createElement("p");
  name.className = "person-name";
  name.textContent = person.name;
  el.appendChild(name);

  const section = (tagClass, tagText, items) => {
    if (!items.length) return;
    const tag = document.createElement("span");
    tag.className = `tag ${tagClass}`;
    tag.textContent = tagText;
    const ul = document.createElement("ul");
    items.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    el.append(tag, ul);
  };

  section("blocked", "Dealbreaker", person.blocked_by);
  section("gets", "Gets", person.gets);
  section("gives", "Gives up", person.gives_up);

  if (!person.gives_up.length && !person.blocked_by.length) {
    const p = document.createElement("p");
    p.className = "muted small";
    p.textContent = "No compromises for them here.";
    el.appendChild(p);
  }
  return el;
}

function optionCard(option, rank, blocked = false) {
  const card = document.createElement("div");
  card.className = blocked ? "option blocked-option" : "option";

  const head = document.createElement("div");
  head.className = "option-head";
  const title = document.createElement("h3");
  title.className = "option-title";
  title.textContent = option.listing.title;
  head.appendChild(title);

  if (!blocked) {
    const badge = document.createElement("span");
    badge.className = "option-rank";
    badge.textContent = `Option ${rank}`;
    head.appendChild(badge);
  }
  card.appendChild(head);

  const facts = document.createElement("p");
  facts.className = "option-facts";
  const l = option.listing;
  const perHead = Math.ceil(l.rent_total / option.breakdown.length);
  facts.textContent =
    `${l.area} · ${l.bhk}BHK · ${l.bathrooms} bath · floor ${l.floor} · ` +
    `₹${l.rent_total.toLocaleString("en-IN")}/mo total (₹${perHead.toLocaleString("en-IN")} each) · ` +
    `${l.has_lift ? "lift" : "no lift"} · ${l.has_parking ? "parking" : "no parking"} · ` +
    `${l.pet_friendly ? "pet friendly" : "no pets"}`;
  card.appendChild(facts);

  if (blocked) {
    const why = document.createElement("p");
    why.className = "blocked-by";
    why.textContent = `Ruled out for: ${option.blocked_people.join(", ")}`;
    card.appendChild(why);
  } else if (option.summary) {
    const s = document.createElement("div");
    s.className = "option-summary";
    s.textContent = option.summary;
    card.appendChild(s);
  }

  const grid = document.createElement("div");
  grid.className = "people-grid";
  option.breakdown.forEach((p) => grid.appendChild(personBlock(p)));
  card.appendChild(grid);

  return card;
}

async function loadResults() {
  show("results");
  $("results-list").innerHTML = '<div class="empty">Working through every listing against everyone\'s constraints…</div>';
  $("near-misses-block").hidden = true;

  try {
    const data = await api(`/api/match?code=${encodeURIComponent(currentCode)}`);
    const list = $("results-list");
    list.innerHTML = "";

    const names = data.participants.map((p) => p.name).join(", ");
    $("results-meta").textContent =
      `${data.evaluated} listings checked against ${data.participants.length} ${data.participants.length === 1 ? "person" : "people"} (${names}). ` +
      `${data.viable_count} clear everyone's dealbreakers.`;

    if (!data.shortlist.length) {
      list.innerHTML =
        '<div class="empty">Nothing clears everyone\'s dealbreakers yet. Look at what\'s ruled out below — usually one constraint is doing all the damage.</div>';
    } else {
      data.shortlist.forEach((o, i) => list.appendChild(optionCard(o, i + 1)));
    }

    if (data.near_misses && data.near_misses.length) {
      const nm = $("near-misses-list");
      nm.innerHTML = "";
      data.near_misses.forEach((o) => nm.appendChild(optionCard(o, 0, true)));
      $("near-misses-block").hidden = false;
    }
  } catch (e) {
    $("results-list").innerHTML = `<p class="error">${e.message}</p>`;
  }
}

// Deep link straight into a session when someone opens a shared link.
const params = new URLSearchParams(location.search);
if (params.get("code")) {
  enterSession(params.get("code").toUpperCase());
} else {
  show("home");
}

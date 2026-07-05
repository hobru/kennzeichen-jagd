/* Kennzeichen-Jagd – App-Logik. Alle Daten bleiben lokal (localStorage). */
(function () {
  "use strict";

  // ── Konstanten ──────────────────────────────────────────────
  const DATA_URL =
    "https://raw.githubusercontent.com/openpotato/kfz-kennzeichen/main/src/de/kennzeichen.csv";
  const LS = {
    spots: "kj_spots_v1",
    dataset: "kj_dataset_v1",
    pin: "kj_pin_v1",
  };
  const STATES = {
    BW: "Baden-Württemberg", BY: "Bayern", BE: "Berlin", BB: "Brandenburg",
    HB: "Bremen", HH: "Hamburg", HE: "Hessen", MV: "Mecklenburg-Vorpommern",
    NI: "Niedersachsen", NW: "Nordrhein-Westfalen", RP: "Rheinland-Pfalz",
    SL: "Saarland", SN: "Sachsen", ST: "Sachsen-Anhalt",
    SH: "Schleswig-Holstein", TH: "Thüringen",
  };

  // ── Hilfen ──────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (ts) =>
    new Date(ts).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  }
  function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256",
      new TextEncoder().encode("kj-salt::" + text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ── Zustand ─────────────────────────────────────────────────
  let dataset = [];          // [[code, stadt, land, herleitung], …]
  let byCode = new Map();
  let spots = loadJSON(LS.spots, []);   // {code, city, state, ts, lat, lon}
  let current = null;                    // aktuell nachgeschlagener Eintrag
  let map = null, markers = null;

  function setDataset(rows, info) {
    dataset = rows.slice().sort((a, b) => a[0].localeCompare(b[0], "de"));
    byCode = new Map(dataset.map((r) => [r[0], r]));
    $("dsInfo").textContent =
      dataset.length + " Unterscheidungszeichen · " + info;
    updateProgress();
  }
  function initDataset() {
    const cached = loadJSON(LS.dataset, null);
    if (cached && Array.isArray(cached.rows) && cached.rows.length > 600) {
      setDataset(cached.rows, "aktualisiert am " + fmtDate(cached.ts));
    } else {
      setDataset(window.KENNZEICHEN_SNAPSHOT || [], "mitgelieferter Stand");
    }
  }

  // ── CSV-Parser (für Aktualisierung) ────────────────────────
  function parseCSV(text) {
    const rows = [];
    let field = "", row = [], inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some((f) => f !== "")) rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  async function refreshDataset() {
    const st = $("refreshStatus");
    st.textContent = "Lade aktuelle Liste …";
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const rows = parseCSV(await res.text());
      const head = rows[0].map((h) => h.trim());
      const iCode = head.indexOf("Unterscheidungszeichen");
      const iCity = head.indexOf("StadtOderKreis");
      const iHer = head.indexOf("Herleitung");
      const iIso = head.indexOf("Bundesland.Iso3166-2");
      if (iCode < 0 || iCity < 0 || iIso < 0)
        throw new Error("Unerwartetes Spaltenformat");
      const parsed = rows.slice(1)
        .filter((r) => r[iCode] && r[iCity])
        .map((r) => [
          r[iCode].trim(), r[iCity].trim(),
          (r[iIso] || "").replace("DE-", "").trim(),
          iHer >= 0 ? (r[iHer] || "").trim() : "",
        ]);
      if (parsed.length < 600)
        throw new Error("Liste unvollständig (" + parsed.length + " Einträge)");
      saveJSON(LS.dataset, { ts: Date.now(), rows: parsed });
      setDataset(parsed, "aktualisiert am " + fmtDate(Date.now()));
      st.textContent = "Aktualisiert: " + parsed.length + " Einträge.";
    } catch (err) {
      st.textContent = "Aktualisierung fehlgeschlagen: " + err.message +
        " – die vorhandene Liste bleibt aktiv.";
    }
  }

  // ── Nachschlagen & Vorschläge ──────────────────────────────
  function extractCode(input) {
    const m = input.toUpperCase().match(/^[A-ZÄÖÜ]{1,3}/);
    return m ? m[0] : "";
  }
  function findSpot(code) { return spots.find((s) => s.code === code); }

  function renderSuggestions(q) {
    const box = $("suggest");
    if (!q) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    const qU = q.toUpperCase();
    const hits = [];
    for (const r of dataset) {
      if (r[0].startsWith(qU)) hits.push(r);
      if (hits.length >= 8) break;
    }
    if (hits.length < 8 && qU.length >= 3) {
      for (const r of dataset) {
        if (!r[0].startsWith(qU) &&
            r[1].toUpperCase().includes(qU)) hits.push(r);
        if (hits.length >= 8) break;
      }
    }
    if (!hits.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    box.innerHTML = hits.map((r) =>
      `<li role="option" data-code="${esc(r[0])}" class="${findSpot(r[0]) ? "spotted" : ""}">
         <span class="s-code">${esc(r[0])}</span>
         <span class="s-city">${esc(r[1])}</span></li>`).join("");
    box.classList.remove("hidden");
  }

  function showResult(code) {
    const entry = byCode.get(code);
    const box = $("resultBox");
    if (!entry) { box.classList.add("hidden"); current = null; return; }
    current = entry;
    $("resCode").textContent = entry[0];
    $("resCity").textContent = entry[1];
    $("resState").textContent = STATES[entry[2]] || entry[2];
    $("resHerleitung").textContent = entry[3] ? "„" + entry[3] + "“" : "";
    const dup = findSpot(code);
    const badge = $("resBadge"), dupBox = $("dupInfo"), save = $("saveBtn");
    if (dup) {
      badge.textContent = "Gesammelt"; badge.className = "badge";
      dupBox.innerHTML = "Bereits gesichtet am <b>" + esc(fmtDate(dup.ts)) + "</b>" +
        (dup.lat != null
          ? ' <span class="mono">(' + dup.lat.toFixed(4) + ", " + dup.lon.toFixed(4) + ")</span>"
          : "");
      dupBox.classList.remove("hidden");
      save.disabled = true; save.textContent = "Schon in der Sammlung";
    } else {
      badge.textContent = "Neu!"; badge.className = "badge warn";
      dupBox.classList.add("hidden");
      save.disabled = false; save.textContent = "Sichtung speichern";
    }
    $("gpsStatus").textContent = "";
    box.classList.remove("hidden");
  }

  function getPosition() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    });
  }

  async function saveSpot() {
    if (!current || findSpot(current[0])) return;
    const btn = $("saveBtn"), gps = $("gpsStatus");
    btn.disabled = true; btn.textContent = "Hole GPS-Position …";
    const pos = await getPosition();
    let usePos = pos;
    if (!pos) {
      gps.textContent = "Keine GPS-Position verfügbar.";
      if (!confirm("Ohne Standort speichern?")) {
        btn.disabled = false; btn.textContent = "Sichtung speichern"; return;
      }
      usePos = null;
    }
    const spot = {
      code: current[0], city: current[1], state: current[2],
      ts: Date.now(),
      lat: usePos ? usePos.lat : null, lon: usePos ? usePos.lon : null,
    };
    spots.push(spot);
    saveJSON(LS.spots, spots);
    gps.textContent = usePos
      ? "Gespeichert bei " + usePos.lat.toFixed(4) + ", " + usePos.lon.toFixed(4)
      : "Ohne Standort gespeichert.";
    $("lastSpot").textContent =
      "Zuletzt: " + spot.code + " – " + spot.city + " (" + fmtDate(spot.ts) + ")";
    $("lastSpot").classList.remove("hidden");
    showResult(spot.code);           // zeigt jetzt den Duplikat-Zustand
    renderAll();
    $("plateInput").select();
  }

  // ── Liste ───────────────────────────────────────────────────
  function renderList() {
    const q = $("listSearch").value.trim().toUpperCase();
    const items = spots
      .filter((s) => !q || s.code.includes(q) || s.city.toUpperCase().includes(q))
      .sort((a, b) => b.ts - a.ts);
    $("spotList").innerHTML = items.map((s) => `
      <li class="spot">
        <span class="spot-code">${esc(s.code)}</span>
        <span class="spot-body">
          <span class="spot-city">${esc(s.city)} · ${esc(STATES[s.state] || s.state)}</span>
          <span class="spot-meta">${esc(fmtDate(s.ts))}${
            s.lat != null ? " · " + s.lat.toFixed(4) + ", " + s.lon.toFixed(4) : ""}</span>
        </span>
        <button class="spot-del" data-code="${esc(s.code)}"
                aria-label="Sichtung ${esc(s.code)} löschen">✕</button>
      </li>`).join("");
    $("listCount").textContent = items.length + " / " + spots.length;
    $("listEmpty").classList.toggle("hidden", spots.length > 0);
  }

  // ── Karte ───────────────────────────────────────────────────
  function renderMap() {
    const withPos = spots.filter((s) => s.lat != null);
    $("mapEmpty").classList.toggle("hidden", withPos.length > 0);
    if (typeof L === "undefined") return;
    if (!map) {
      map = L.map("map", { zoomControl: true }).setView([51.163, 10.447], 6);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      markers = L.layerGroup().addTo(map);
    }
    markers.clearLayers();
    withPos.forEach((s) => {
      L.marker([s.lat, s.lon]).addTo(markers)
        .bindPopup("<b>" + esc(s.code) + "</b> – " + esc(s.city) +
                   "<br>" + esc(fmtDate(s.ts)));
    });
    if (withPos.length) {
      map.fitBounds(withPos.map((s) => [s.lat, s.lon]), { padding: [30, 30], maxZoom: 12 });
    }
    setTimeout(() => map.invalidateSize(), 60);
  }

  // ── Statistik ───────────────────────────────────────────────
  function updateProgress() {
    const valid = new Set(dataset.map((r) => r[0]));
    const got = new Set(spots.filter((s) => valid.has(s.code)).map((s) => s.code));
    $("progressChip").textContent = got.size + " / " + dataset.length;
    return got;
  }
  function renderStats() {
    const got = updateProgress();
    $("statSpotted").textContent = got.size;
    $("statTotal").textContent = dataset.length;
    $("statBar").style.width =
      (dataset.length ? (100 * got.size / dataset.length) : 0) + "%";
    const per = {};
    dataset.forEach((r) => {
      per[r[2]] = per[r[2]] || { total: 0, got: 0 };
      per[r[2]].total++;
      if (got.has(r[0])) per[r[2]].got++;
    });
    $("statStates").innerHTML = Object.keys(per)
      .sort((a, b) => (STATES[a] || a).localeCompare(STATES[b] || b, "de"))
      .map((k) => {
        const p = per[k], pct = Math.round(100 * p.got / p.total);
        return `<li class="statrow ${p.got === p.total ? "done" : ""}">
          <div class="top"><span class="name">${esc(STATES[k] || k)}</span>
          <span class="nums">${p.got} / ${p.total}</span></div>
          <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div></li>`;
      }).join("");
  }

  function renderAll() { renderList(); renderStats(); if (map) renderMap(); }

  // ── Export / Import ─────────────────────────────────────────
  function exportJSON() {
    download("kennzeichen-jagd-backup-" +
      new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify({ app: "kennzeichen-jagd", version: 1,
        exported: new Date().toISOString(), spots }, null, 2),
      "application/json");
  }
  function exportCSV() {
    const q = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
    const lines = ["Kuerzel,StadtOderKreis,Bundesland,Zeitpunkt,Breite,Laenge"];
    spots.slice().sort((a, b) => a.ts - b.ts).forEach((s) => {
      lines.push([q(s.code), q(s.city), q(STATES[s.state] || s.state),
        q(new Date(s.ts).toISOString()),
        s.lat != null ? s.lat : "", s.lon != null ? s.lon : ""].join(","));
    });
    download("kennzeichen-jagd-" + new Date().toISOString().slice(0, 10) + ".csv",
      "\uFEFF" + lines.join("\n"), "text/csv;charset=utf-8");
  }
  function importJSON(file) {
    const st = $("importStatus");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const list = Array.isArray(data) ? data : data.spots;
        if (!Array.isArray(list)) throw new Error("Kein gültiges Backup");
        let added = 0;
        list.forEach((s) => {
          if (s && typeof s.code === "string" && !findSpot(s.code)) {
            spots.push({
              code: s.code, city: s.city || (byCode.get(s.code) || ["", "?"])[1],
              state: s.state || (byCode.get(s.code) || ["", "", "?"])[2],
              ts: Number(s.ts) || Date.now(),
              lat: typeof s.lat === "number" ? s.lat : null,
              lon: typeof s.lon === "number" ? s.lon : null,
            });
            added++;
          }
        });
        saveJSON(LS.spots, spots);
        renderAll();
        st.textContent = "Import fertig: " + added + " neue, " +
          (list.length - added) + " übersprungen (schon vorhanden).";
      } catch (err) {
        st.textContent = "Import fehlgeschlagen: " + err.message;
      }
    };
    reader.readAsText(file);
  }

  // ── PIN-Sperre ──────────────────────────────────────────────
  async function initLock() {
    const stored = localStorage.getItem(LS.pin);
    const lock = $("lock"), msg = $("lockMsg"),
      input = $("pinInput"), btn = $("pinBtn");
    if (sessionStorage.getItem("kj_unlocked") === "1" && stored) {
      $("app").classList.remove("hidden"); return;
    }
    lock.classList.remove("hidden");
    let firstPin = null;
    if (!stored) {
      msg.textContent = "Willkommen! Lege eine PIN fest (mind. 4 Ziffern).";
      btn.textContent = "PIN festlegen";
    }
    async function submit() {
      const val = input.value.trim();
      if (!/^\d{4,8}$/.test(val)) {
        msg.textContent = "Bitte 4–8 Ziffern eingeben."; input.value = ""; return;
      }
      if (!localStorage.getItem(LS.pin)) {
        if (firstPin === null) {
          firstPin = val; input.value = "";
          msg.textContent = "PIN zur Bestätigung erneut eingeben.";
          return;
        }
        if (val !== firstPin) {
          firstPin = null; input.value = "";
          msg.textContent = "Die PINs stimmen nicht überein – nochmal von vorn.";
          btn.textContent = "PIN festlegen";
          return;
        }
        localStorage.setItem(LS.pin, await sha256(val));
      } else if (await sha256(val) !== localStorage.getItem(LS.pin)) {
        msg.textContent = "Falsche PIN."; input.value = ""; return;
      }
      sessionStorage.setItem("kj_unlocked", "1");
      lock.classList.add("hidden");
      $("app").classList.remove("hidden");
      setTimeout(() => $("plateInput").focus(), 50);
    }
    btn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    input.focus();
  }
  async function changePin() {
    const cur = prompt("Aktuelle PIN eingeben:");
    if (cur === null) return;
    if (await sha256(cur.trim()) !== localStorage.getItem(LS.pin)) {
      alert("Falsche PIN."); return;
    }
    const neu = prompt("Neue PIN (4–8 Ziffern):");
    if (neu === null) return;
    if (!/^\d{4,8}$/.test(neu.trim())) { alert("Bitte 4–8 Ziffern."); return; }
    localStorage.setItem(LS.pin, await sha256(neu.trim()));
    alert("PIN geändert.");
  }

  // ── Verdrahtung ─────────────────────────────────────────────
  function wire() {
    const input = $("plateInput");
    input.addEventListener("input", () => {
      const code = extractCode(input.value);
      renderSuggestions(code);
      showResult(code);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const first = $("suggest").querySelector("li");
        if (!byCode.get(extractCode(input.value)) && first) {
          input.value = first.dataset.code;
          input.dispatchEvent(new Event("input"));
        }
        $("suggest").classList.add("hidden");
        if (current && !$("saveBtn").disabled) saveSpot();
      }
    });
    $("suggest").addEventListener("click", (e) => {
      const li = e.target.closest("li[data-code]");
      if (!li) return;
      input.value = li.dataset.code;
      $("suggest").classList.add("hidden");
      showResult(li.dataset.code);
      input.focus();
    });
    $("saveBtn").addEventListener("click", saveSpot);
    $("listSearch").addEventListener("input", renderList);
    $("spotList").addEventListener("click", (e) => {
      const btn = e.target.closest(".spot-del");
      if (!btn) return;
      if (!confirm(btn.dataset.code + " wirklich aus der Sammlung löschen?")) return;
      spots = spots.filter((s) => s.code !== btn.dataset.code);
      saveJSON(LS.spots, spots);
      renderAll();
      if (current) showResult(current[0]);
    });
    $("refreshBtn").addEventListener("click", refreshDataset);
    $("exportJsonBtn").addEventListener("click", exportJSON);
    $("exportCsvBtn").addEventListener("click", exportCSV);
    $("importFile").addEventListener("change", (e) => {
      if (e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = "";
    });
    $("changePinBtn").addEventListener("click", changePin);
    $("wipeBtn").addEventListener("click", () => {
      if (!confirm("Wirklich ALLE Sichtungen unwiderruflich löschen?")) return;
      if (!confirm("Letzte Chance – Sammlung komplett leeren?")) return;
      spots = [];
      saveJSON(LS.spots, spots);
      renderAll();
    });
    document.querySelectorAll(".tabbtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tabbtn").forEach((b) =>
          b.classList.toggle("active", b === btn));
        document.querySelectorAll(".tab").forEach((t) =>
          t.classList.toggle("active", t.id === "tab-" + btn.dataset.tab));
        if (btn.dataset.tab === "karte") renderMap();
        if (btn.dataset.tab === "statistik") renderStats();
      });
    });
  }

  // ── Start ───────────────────────────────────────────────────
  initDataset();
  wire();
  renderAll();
  initLock();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();

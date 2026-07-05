/* Kennzeichen-Jagd – App-Logik. Alle Daten bleiben lokal (localStorage). */
(function () {
  "use strict";

  // ── Konstanten ──────────────────────────────────────────────
  const DATA_URL =
    "https://raw.githubusercontent.com/openpotato/kfz-kennzeichen/main/src/de/kennzeichen.csv";
  const LS = {
    spots: "kj_spots_v1",
    dataset: "kj_dataset_v1",
    geo: "kj_geo_v1",
  };
  localStorage.removeItem("kj_pin_v1"); // Altlast aus früherer Version entfernen
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

  function showResult(code, justSaved) {
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
    const coords = dup && dup.lat != null
      ? ' <span class="mono">(' + dup.lat.toFixed(4) + ", " + dup.lon.toFixed(4) + ")</span>"
      : "";
    if (dup && justSaved) {
      badge.textContent = "Gesammelt"; badge.className = "badge";
      dupBox.innerHTML = "✓ Neu in der Sammlung! Gespeichert am <b>" +
        esc(fmtDate(dup.ts)) + "</b>" + coords;
      dupBox.className = "dup ok";
      save.disabled = true; save.textContent = "Gespeichert ✓";
    } else if (dup) {
      badge.textContent = "Gesammelt"; badge.className = "badge";
      dupBox.innerHTML = "Bereits gesichtet am <b>" + esc(fmtDate(dup.ts)) + "</b>" + coords;
      dupBox.className = "dup";
      save.disabled = true; save.textContent = "Schon in der Sammlung";
    } else {
      badge.textContent = "Neu!"; badge.className = "badge warn";
      dupBox.className = "dup hidden";
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
    showResult(spot.code, true);     // grüne Bestätigung statt Duplikat-Warnung
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
  let mapMode = "alle";
  let geoCache = loadJSON(LS.geo, {});   // { code: [lat, lon] | null }
  let geoRunning = false;

  function fitTo(points) {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 11);
    else map.fitBounds(points, { padding: [30, 30], maxZoom: 12 });
  }

  async function geocodeMissing(codes) {
    if (geoRunning) return;
    geoRunning = true;
    const st = $("mapStatus");
    const missing = codes.filter((c) => !(c in geoCache));
    for (let i = 0; i < missing.length; i++) {
      if (mapMode !== "herkunft") break;   // Nutzer hat umgeschaltet
      st.textContent = "Herkunftsorte werden ermittelt … " +
        (i + 1) + " / " + missing.length;
      const entry = byCode.get(missing[i]);
      if (!entry) { geoCache[missing[i]] = null; continue; }
      const place = entry[1].split(",")[0].trim();
      const q = encodeURIComponent(
        place + ", " + (STATES[entry[2]] || "") + ", Deutschland");
      try {
        const res = await fetch(
          "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + q,
          { headers: { Accept: "application/json" } });
        const js = await res.json();
        geoCache[missing[i]] = js && js[0]
          ? [parseFloat(js[0].lat), parseFloat(js[0].lon)] : null;
      } catch (_) {
        break;                              // offline o. ä. – später erneut
      }
      saveJSON(LS.geo, geoCache);
      if (mapMode === "herkunft") drawMarkers();  // Karte fortlaufend füllen
      await new Promise((r) => setTimeout(r, 1100)); // Nominatim: max. 1 Anfrage/s
    }
    st.textContent = "";
    geoRunning = false;
  }

  function drawMarkers() {
    markers.clearLayers();
    const st = $("mapStatus");
    let points = [];

    if (mapMode === "herkunft") {
      $("mapEmpty").classList.toggle("hidden", spots.length > 0);
      spots.forEach((s) => {
        const pos = geoCache[s.code];
        if (!pos) return;
        points.push(pos);
        L.circleMarker(pos, {
          radius: 9, color: "#003399", weight: 2,
          fillColor: "#2450C7", fillOpacity: 0.85,
        }).addTo(markers)
          .bindPopup("<b>" + esc(s.code) + "</b> – " + esc(s.city) +
                     "<br>gesichtet am " + esc(fmtDate(s.ts)));
      });
    } else {
      const withPos = spots.filter((s) => s.lat != null)
        .sort((a, b) => b.ts - a.ts);
      const show = mapMode === "letzte" ? withPos.slice(0, 1) : withPos;
      $("mapEmpty").classList.toggle("hidden", withPos.length > 0);
      st.textContent = "";
      show.forEach((s) => {
        points.push([s.lat, s.lon]);
        L.marker([s.lat, s.lon]).addTo(markers)
          .bindPopup("<b>" + esc(s.code) + "</b> – " + esc(s.city) +
                     "<br>" + esc(fmtDate(s.ts)) +
                     (mapMode === "letzte" ? "<br><i>letzte Sichtung</i>" : ""));
      });
      if (mapMode === "letzte" && show.length) {
        markers.getLayers()[0].openPopup();
      }
    }
    fitTo(points);
  }

  function renderMap() {
    if (typeof L === "undefined") return;
    if (!map) {
      map = L.map("map", { zoomControl: true }).setView([51.163, 10.447], 6);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      markers = L.layerGroup().addTo(map);
    }
    drawMarkers();
    if (mapMode === "herkunft") {
      geocodeMissing(Array.from(new Set(spots.map((s) => s.code))));
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

  // ── Scanner (Kamera + OCR) ─────────────────────────────────
  const TESSERACT_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js";
  let ocrWorker = null, scanStream = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector('script[src="' + src + '"]')) return res();
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("Laden fehlgeschlagen"));
      document.head.appendChild(s);
    });
  }
  async function ensureOCR(status) {
    if (ocrWorker) return ocrWorker;
    status("Texterkennung wird geladen … (einmalig, danach gecacht)");
    await loadScript(TESSERACT_URL);
    ocrWorker = await Tesseract.createWorker("deu");
    await ocrWorker.setParameters({ tessedit_pageseg_mode: "7" }); // eine Textzeile
    return ocrWorker;
  }

  // OCR-typische Verwechsler in Buchstaben zurückübersetzen
  const LOOKALIKE = { "0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "8": "B" };
  function parsePlateText(text) {
    const tokens = (text.toUpperCase().match(/[A-Z0-9ÄÖÜ]+/g) || []);
    for (const tRaw of tokens) {
      const variants = [tRaw,
        tRaw.replace(/[0-9]/g, (d) => LOOKALIKE[d] || d)];
      for (const t of variants) {
        const m = t.match(/^[A-ZÄÖÜ]{1,3}/);
        if (!m) continue;
        // längste gültige Übereinstimmung bevorzugen
        for (let len = m[0].length; len >= 1; len--) {
          const cand = m[0].slice(0, len);
          if (byCode.has(cand)) return cand;
        }
      }
    }
    return null;
  }

  function stopScan() {
    if (scanStream) { scanStream.getTracks().forEach((t) => t.stop()); scanStream = null; }
    $("scanModal").classList.add("hidden");
  }

  async function openScan() {
    const modal = $("scanModal"), video = $("scanVideo"), st = $("scanStatus");
    const status = (t) => { st.textContent = t; };
    modal.classList.remove("hidden");
    status("Kamera startet …");
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 } },
        audio: false,
      });
      video.srcObject = scanStream;
      await video.play();
      status("Kennzeichen in den gelben Rahmen halten, dann „Scannen“.");
    } catch (err) {
      status("Kein Kamerazugriff: " + err.message);
    }
  }

  async function shootScan() {
    const video = $("scanVideo"), canvas = $("scanCanvas"), st = $("scanStatus");
    const status = (t) => { st.textContent = t; };
    if (!scanStream || !video.videoWidth) return;
    // Bildausschnitt = gelber Rahmen (6 % Rand, Seitenverhältnis 4.7:1, vertikal mittig)
    const vw = video.videoWidth, vh = video.videoHeight;
    const gw = vw * 0.88, gh = gw / 4.7, gx = vw * 0.06, gy = (vh - gh) / 2;
    const W = 1200, H = Math.round(W * gh / gw);
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, gx, gy, gw, gh, 0, 0, W, H);
    // Vorverarbeitung: Graustufen + Kontrastspreizung
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = g;
      if (g < min) min = g; if (g > max) max = g;
    }
    const span = Math.max(1, max - min);
    for (let i = 0; i < d.length; i += 4) {
      const v = ((d[i] - min) / span) * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    try {
      const worker = await ensureOCR(status);
      status("Erkenne Schrift …");
      const { data } = await worker.recognize(canvas);
      const raw = (data.text || "").trim();
      const code = parsePlateText(raw);
      if (code) {
        stopScan();
        const input = $("plateInput");
        input.value = code;
        $("suggest").classList.add("hidden");
        showResult(code);
        input.focus();
      } else {
        status(raw
          ? "Kein gültiges Kürzel erkannt („" + raw.slice(0, 25) + "“) – näher ran und erneut scannen."
          : "Nichts erkannt – näher ran, gerade halten, erneut scannen.");
      }
    } catch (err) {
      status("Texterkennung fehlgeschlagen: " + err.message);
    }
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
    $("wipeBtn").addEventListener("click", () => {
      if (!confirm("Wirklich ALLE Sichtungen unwiderruflich löschen?")) return;
      if (!confirm("Letzte Chance – Sammlung komplett leeren?")) return;
      spots = [];
      saveJSON(LS.spots, spots);
      renderAll();
    });
    $("scanBtn").addEventListener("click", openScan);
    $("scanShot").addEventListener("click", shootScan);
    $("scanCancel").addEventListener("click", stopScan);
    document.querySelectorAll(".mapbtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        mapMode = btn.dataset.mode;
        document.querySelectorAll(".mapbtn").forEach((b) =>
          b.classList.toggle("active", b === btn));
        renderMap();
      });
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
  const V = window.APP_VERSION || "?";
  $("verTop").textContent = "v" + V;
  $("aboutLine").textContent = "Kennzeichen-Jagd v" + V;
  setTimeout(() => $("plateInput").focus(), 50);
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();

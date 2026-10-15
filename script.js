/* MindPulse AI - script.js
   Everything the page does lives in this one file. */
(function () {
  "use strict";

  /* ===== 1. SETTINGS ===== */
  // Address of your FastAPI server. Start it with:  uvicorn main:app --reload
  // Change this one line if the API runs somewhere else.
  const API_BASE_URL = "http://127.0.0.1:8000";

  /* ===== 2. THE TABLE FIELDS =====
     "key" is the exact field name main.py expects.
     The option text is also the exact value the API accepts. */
  const COUNTRIES = ["Other", "India", "USA", "Canada", "Australia", "UK", "Germany", "Mexico", "Turkey", "France"];
  const PLATFORMS = ["Facebook", "LinkedIn", "Instagram", "Snapchat", "Twitter", "YouTube", "TikTok", "LINE", "KakaoTalk", "VKontakte", "WhatsApp", "WeChat"];
  const FIELDS = [
    { key: "age", label: "Age", kind: "int", min: 10, max: 100, hint: "Whole number, 10 to 100" },
    { key: "gender", label: "Gender", kind: "choice", options: ["Male", "Female"], hint: "Male or Female" },
    { key: "country", label: "Country", kind: "choice", options: COUNTRIES, hint: "Pick Other if not listed" },
    { key: "academic_level", label: "Academic level", kind: "choice", options: ["High School", "Undergraduate", "Graduate"], hint: "Current level of study" },
    { key: "most_used_platform", label: "Most used platform", kind: "choice", options: PLATFORMS, hint: "The one you open most" },
    { key: "purpose_of_use", label: "Main purpose of use", kind: "choice", options: ["Networking", "Education", "Entertainment", "News"], hint: "Why you mostly use it" },
    { key: "avg_daily_usage_hours", label: "Social media per day (hours)", kind: "float", min: 0, max: 24, hint: "0 to 24, decimals allowed" },
    { key: "daily_unlocks", label: "Phone unlocks per day", kind: "int", min: 0, hint: "Whole number, 0 or more" },
    { key: "study_hours", label: "Study per day (hours)", kind: "float", min: 0, max: 24, hint: "0 to 24, decimals allowed" },
    { key: "physical_activity_hours", label: "Physical activity per day (hours)", kind: "float", min: 0, max: 24, hint: "0 to 24, decimals allowed" },
    { key: "sleep_hours_per_night", label: "Sleep per night (hours)", kind: "float", min: 0, max: 24, hint: "0 to 24, decimals allowed" },
    { key: "stress_level", label: "Stress level", kind: "choice", options: ["Low", "Medium", "High", "Very High"], hint: "How stressed you usually feel" }
  ];
  // Used by the "Your 24 hours" card (these are only the numbers the user typed)
  const DAY = [
    { key: "sleep_hours_per_night", name: "Sleep", color: "#36c6ff" },
    { key: "study_hours", name: "Study", color: "#8be04a" },
    { key: "physical_activity_hours", name: "Physical activity", color: "#f2c230" },
    { key: "avg_daily_usage_hours", name: "Social media", color: "#ff8a3d" }
  ];
  const IDLE_TEXT = "No result yet. Fill in the table and press Run Prediction.";

  /* ===== 3. STATE AND HELPERS ===== */
  const $ = (sel) => document.querySelector(sel);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const r2 = (n) => Math.round(n * 100) / 100;
  let busy = false;      // true while a request is running (stops double submits)
  let lastScore = null;  // last score returned by the API
  let lastRows = [];     // the answers that were sent with that score

  function toast(message, type) {
    const el = document.createElement("div");
    el.className = "toast " + (type || "info");
    el.textContent = message;
    $("#toasts").appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }

  /* ===== 4. BUILD THE TABLE ===== */
  function rowHTML(f) {
    let input;
    if (f.kind === "choice") {
      const opts = f.options.map((o) => `<option>${o}</option>`).join("");
      input = `<select id="f-${f.key}" data-key="${f.key}" aria-describedby="e-${f.key}"><option value="">Choose...</option>${opts}</select>`;
    } else {
      const max = f.max === undefined ? "" : ` max="${f.max}"`;
      const step = f.kind === "int" ? "1" : "any";
      input = `<input id="f-${f.key}" data-key="${f.key}" type="number" inputmode="decimal" min="${f.min}"${max} step="${step}" aria-describedby="e-${f.key}">`;
    }
    return `<tr><th scope="row"><label for="f-${f.key}">${f.label}</label></th>` +
      `<td>${input}<p class="fe" id="e-${f.key}"></p></td><td class="hint">${f.hint}</td></tr>`;
  }
  $("#rows").innerHTML = FIELDS.map(rowHTML).join("");

  const value = (key) => $("#f-" + key).value.trim();

  /* ===== 5. LIVE "YOUR 24 HOURS" CARD ===== */
  function renderDay() {
    const hours = DAY.map((d) => Math.max(0, Number(value(d.key)) || 0));
    const total = hours.reduce((a, b) => a + b, 0);
    const scale = Math.max(total, 24); // keep the bar inside 24 hours
    $("#stack").innerHTML = DAY.map((d, i) => `<i style="width:${(hours[i] / scale * 100).toFixed(1)}%;background:${d.color}"></i>`).join("");
    $("#legend").innerHTML = DAY.map((d, i) => `<li><em style="--c:${d.color}"></em>${d.name}<b>${r2(hours[i])} h</b></li>`).join("") +
      `<li><em style="--c:#4b5d68"></em>Other time<b>${r2(Math.max(0, 24 - total))} h</b></li>`;
    $("#dayNote").textContent = total > 24
      ? "These add up to more than 24 hours. Check your entries."
      : "Updates as you type. Built only from your inputs.";
  }

  function onEdit(e) {
    const key = e.target.dataset.key;
    if (!key) return;
    $("#e-" + key).textContent = "";
    e.target.setAttribute("aria-invalid", "false");
    renderDay();
    if (lastScore !== null) { // the shown score no longer matches the table
      $("#stale").hidden = false;
      $("#ring").classList.add("old");
    }
  }
  $("#rows").addEventListener("input", onEdit);
  $("#rows").addEventListener("change", onEdit);

  /* ===== 6. VALIDATION ===== */
  function check(f) {
    const raw = value(f.key);
    if (raw === "") return "Required.";
    if (f.kind === "choice") return "";
    const n = Number(raw);
    if (Number.isNaN(n)) return "Enter a number.";
    if (f.kind === "int" && !Number.isInteger(n)) return "Whole number only.";
    if (n < f.min) return "Minimum is " + f.min + ".";
    if (f.max !== undefined && n > f.max) return "Maximum is " + f.max + ".";
    return "";
  }

  function validateAll() {
    let first = null;
    FIELDS.forEach((f) => {
      const message = check(f);
      $("#e-" + f.key).textContent = message;
      $("#f-" + f.key).setAttribute("aria-invalid", message ? "true" : "false");
      if (message && !first) first = $("#f-" + f.key);
    });
    if (first) {
      first.focus();
      toast("Please fix the highlighted fields.", "error");
    }
    return !first;
  }

  /* ===== 7. TALKING TO THE API ===== */
  // Numbers are sent as numbers, words as words
  function buildPayload() {
    const body = {};
    FIELDS.forEach((f) => { body[f.key] = f.kind === "choice" ? value(f.key) : Number(value(f.key)); });
    return body;
  }

  function setBusy(on) {
    busy = on;
    $("#ring").classList.toggle("busy", on);
    document.querySelectorAll(".pill-main, .run").forEach((b) => { b.disabled = on; b.textContent = on ? "Predicting..." : "Run Prediction"; });
    if (on) $("#status").textContent = "Sending your answers to the model...";
  }

  function describeError(status, data) {
    // FastAPI sends a "detail" list when an input is invalid (HTTP 422)
    if (status === 422 && data && Array.isArray(data.detail)) {
      return "The API rejected an input: " + data.detail.map((d) => (d.loc || []).slice(1).join(".") + " - " + d.msg).join("; ");
    }
    return "The API returned an error (HTTP " + status + "). Check the terminal running uvicorn for details.";
  }

  function showError(message) {
    $("#apiErr").textContent = message;
    $("#retryBtn").hidden = false;
    $("#status").textContent = "No result. Your answers are still in the table.";
    toast("Could not get a result.", "error");
  }

  async function predict() {
    if (busy || !validateAll()) return;
    lastRows = FIELDS.map((f) => f.label + ": " + value(f.key)); // remember what we send
    $("#apiErr").textContent = "";
    $("#retryBtn").hidden = true;
    setBusy(true);
    try {
      let res;
      try {
        res = await fetch(API_BASE_URL + "/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload())
        });
      } catch (networkError) {
        throw new Error("Cannot reach the API at " + API_BASE_URL + ". Start the FastAPI server, then press Retry. Your answers are still in the table.");
      }
      let data = null;
      try { data = await res.json(); } catch (e) { /* body was not JSON */ }
      if (!res.ok) throw new Error(describeError(res.status, data));
      if (!data || typeof data.predicted_mental_health_score !== "number") {
        throw new Error("The API answered, but not in the expected format.");
      }
      showScore(data.predicted_mental_health_score);
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /* ===== 8. SHOW THE RESULT ===== */
  function countUp(el, target) {
    if (reduceMotion) { el.textContent = String(target); return; }
    const start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / 900, 1);
      el.textContent = p < 1 ? (target * (1 - Math.pow(1 - p, 3))).toFixed(2) : String(target);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function showScore(score) {
    lastScore = score;
    $("#stale").hidden = true;
    $("#ring").classList.remove("old");
    $("#resultActions").hidden = false;
    $("#status").textContent = "Predicted mental health score, exactly as returned by the API. Its scale is not defined there, so it is not interpreted here. This is not a diagnosis.";
    countUp($("#score"), score);
    $("#result").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    toast("Result received from the model.", "success");
  }

  function clearAll() {
    if (busy) return;
    $("#assess").reset();
    FIELDS.forEach((f) => {
      $("#e-" + f.key).textContent = "";
      $("#f-" + f.key).setAttribute("aria-invalid", "false");
    });
    lastScore = null;
    lastRows = [];
    $("#score").textContent = "--";
    $("#ring").classList.remove("old");
    $("#status").textContent = IDLE_TEXT;
    $("#apiErr").textContent = "";
    ["#stale", "#retryBtn", "#resultActions"].forEach((id) => { $(id).hidden = true; });
    renderDay();
    toast("Form cleared.", "info");
  }

  /* ===== 9. BUTTONS ===== */
  $("#assess").addEventListener("submit", (e) => { e.preventDefault(); predict(); }); // also runs on Enter
  $(".pill-main").addEventListener("click", predict);
  $("#retryBtn").addEventListener("click", predict);
  $("#clearBtn").addEventListener("click", clearAll);
  $("#printBtn").addEventListener("click", () => window.print());
  $("#copyBtn").addEventListener("click", async () => {
    const lines = ["MindPulse AI - model output: " + lastScore + " (scale not defined by the API)"].concat(lastRows);
    lines.push("This is a screening estimate, not a diagnosis.");
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast("Summary copied.", "success");
    } catch (e) {
      toast("Could not copy. Select the text and copy it by hand.", "error");
    }
  });

  /* ===== 10. TABS: highlight the section you are looking at ===== */
  const SECTIONS = ["overview", "inputs", "result", "about"];
  function markTab() {
    let current = SECTIONS[0];
    let best = -Infinity;
    SECTIONS.forEach((id) => {
      const top = $("#" + id).getBoundingClientRect().top;
      if (top <= 140 && top > best) { current = id; best = top; }
    });
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + current));
  }
  window.addEventListener("scroll", markTab, { passive: true });
  markTab();

  renderDay();
})();

import { core, data, util, visual } from './lib/psychojs-2024.1.4.js';
const { PsychoJS } = core;
const { TrialHandler } = data;
const { Scheduler } = util;

// ─────────────────────────────────────────────────────────────────────────────
//  1. CONFIGURATION  (mirrors behavioral_opt.py CFG dict)
// ─────────────────────────────────────────────────────────────────────────────
const CFG = {
  product_xl   : "product_list.csv",
  stim_root    : "stim",
  results_root : "pilot_results",

  // timing
  product_dur  : 4.0,
  info_dur     : 9.0,
  fix_min      : 0.5,
  fix_max      : 1.5,

  // randomization
  max_run                : 2,
  question_order_max_run : 3,

  // text
  font               : "NanumGothic",
  text_color         : "white",
  text_height_big    : 0.15,    // endorsement label (norm units)
  text_height_medium : 0.045,   // Likert numbers (height units)
  text_height_small  : 0.05,    // Likert endpoint desc (height units)

  // scale (all scale elements use "height" units, matching Python)
  scale_n       : 7,
  circle_radius : 0.065,
  scale_y       : -0.15,
  numbers_y     : -0.27,
  desc_y        : -0.35,
  label_x       : -0.75,
  label_y       :  0.75,
  scale_x_left  : -0.6,
  scale_x_right :  0.6,
};

// ─────────────────────────────────────────────────────────────────────────────
//  2. INFO TYPE MAPS  (mirrors behavioral_opt.py INFO_CODE_MAP / INFO_LABEL_MAP)
// ─────────────────────────────────────────────────────────────────────────────
const INFO_CODE_MAP = {
  expert    : "01",
  consensus : "02",
  peer      : "03",
  gpt       : "04",
};

// expert resolved dynamically; peer resolved dynamically
const INFO_LABEL_MAP = {
  consensus : "[소비자 의견 종합]",
  gpt       : "[ChatGPT]",
};

// ─────────────────────────────────────────────────────────────────────────────
//  3. QUESTION DEFINITIONS  (mirrors behavioral_opt.py QUESTION_DEFS)
// ─────────────────────────────────────────────────────────────────────────────
const QUESTION_DEFS = {
  credEX   : { bg: "credibility_EX.png",      left: "전혀 전문적이지 않다", right: "매우 전문적이다" },
  credCON  : { bg: "credibility_CON.png",     left: "전혀 반영하지 않는다", right: "매우 반영한다"   },
  credPEER : { bg: "credibility_PEER.png",    left: "전혀 가깝지 않다",     right: "매우 가깝다"     },
  credGen  : { bg: "credibility_general.png", left: "전혀 믿지 않음",       right: "매우 신뢰함"     },
  preference: { bg: "preference.png",         left: "전혀 선호하지 않음",   right: "매우 선호함"     },
};

// GPT gets all 5 credibility+preference Qs; other endorsers get 2
const GPT_QUESTIONS   = ["credEX", "credCON", "credPEER", "credGen", "preference"];
const OTHER_QUESTIONS = ["credGen", "preference"];

// ─────────────────────────────────────────────────────────────────────────────
//  4. RESOURCE MANIFEST
//
//  ROOT CAUSE OF [Init] HANG: PsychoJS preloads every entry in RESOURCES
//  synchronously before showing anything. With 64 products × 4 info codes =
//  256 info images + 64 product images = 325 total files, Pavlovia times out.
//
//  FIX: Only declare the small static assets here (CSVs + 7 PNGs = 9 files).
//  Trial images (product + info) are loaded on-demand via the browser's native
//  image cache (imgCache below). The browser fetches them in the background
//  during the experiment so subsequent trials show instantly.
// ─────────────────────────────────────────────────────────────────────────────

// Only static assets that must exist before the experiment can start
const RESOURCES = [
  { name: 'product_list.csv',              path: 'product_list.csv'              },
  { name: 'expert_labels.csv',             path: 'expert_labels.csv'             },
  { name: 'stim/00_fixation/fixation.png', path: 'stim/00_fixation/fixation.png' },
  { name: 'stim/04_intro/intro.png',       path: 'stim/04_intro/intro.png'       },
  ...Object.values(QUESTION_DEFS).map(q => ({
    name: `stim/03_question/${q.bg}`,
    path: `stim/03_question/${q.bg}`,
  })),
];
// 4 + 5 = 9 resources — Init completes immediately.

// ─────────────────────────────────────────────────────────────────────────────
//  4b. BACKGROUND IMAGE CACHE
//
//  Kicks off native browser fetch for all 320 trial images right after Init,
//  so they are warm in the HTTP cache by the time each trial needs them.
//  Uses HTMLImageElement — zero PsychoJS involvement, no blocking.
// ─────────────────────────────────────────────────────────────────────────────
const PRODUCTS = [
  "airfryer","bath_bomb","body_lotion","body_mist","bread","cable_organizer","cake","canned_tuna",
  "caviar","chips","chocolate","cookies","cup_ramen","decorative_magnet","decorative_tape","disposable_camera",
  "egronomics_chair_seat","egyptian_cotton_sheets_set","electric_toothbrush","fountain_pen","frozen_pizza",
  "gaming_console","hair_brush","instant_coffee","instant_coffee_maker","laptop_stand","leather_notebook",
  "LED_mood_light","lip_balm","luxury_perfume","mango_set","manuka_honey","massaging_roller","memo_pads",
  "mini_camera","mouse_pad","multitab","oil_pastels","organic_olive_oil","paper_weight","pen",
  "portable_charger","portable_humidifier","projector","rc_car","roll-on_mini_perfume","scented_hand_cream",
  "scientific_calculator","shampoo","singing_bowl","skin_care_device","SSD_external_storage","stamp",
  "steak_500g","stickers","supplements","tablet","tea_gift_set","vacuum_cleaner","VR_headset",
  "wax_burner","wax_seal_kit","weighted_blanket","wireless_keyboard",
];

// Holds live HTMLImageElement references so the browser doesn't GC them
// before the trial that needs them. Keyed by URL string.
const imgCache = {};

function warmImageCache() {
  const urls = [
    ...PRODUCTS.map(p => `stim/01_product/${p}.png`),
    ...PRODUCTS.flatMap(p =>
      Object.values(INFO_CODE_MAP).map(code => `stim/02_information/${p}_${code}.png`)
    ),
  ];
  for (const url of urls) {
    if (!imgCache[url]) {
      const el = new Image();
      el.src = url;           // browser fetches and caches immediately
      imgCache[url] = el;     // keep reference alive
    }
  }
}

// Returns a promise that resolves when the image at `url` is fully loaded.
// If it is already cached (complete), resolves on the next microtask.
function waitForImage(url) {
  const el = imgCache[url];
  if (!el) {
    // Shouldn't happen after warmImageCache(), but handle gracefully
    const fresh = new Image();
    imgCache[url] = fresh;
    fresh.src = url;
    return new Promise(resolve => {
      fresh.onload  = resolve;
      fresh.onerror = resolve;  // resolve anyway; PsychoJS will show a broken image
    });
  }
  if (el.complete) return Promise.resolve();
  return new Promise(resolve => {
    el.onload  = resolve;
    el.onerror = resolve;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// mirrors behavioral_opt.py norm()
function norm(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

// mirrors behavioral_opt.py resolve_label()
// peer_name: string | null,  expertLabel: string | null
function resolveLabel(infoType, peerName, expertLabel) {
  if (infoType === "peer") {
    return peerName ? `[${peerName}의 추천]` : null;
  }
  if (infoType === "expert") {
    // expert_label (from CSV) takes priority; fall back to INFO_LABEL_MAP["expert"] (undefined = null)
    return expertLabel || INFO_LABEL_MAP["expert"] || null;
  }
  return INFO_LABEL_MAP[infoType] || null;   // consensus → string, gpt → string, else null
}

// Fisher-Yates shuffle (in-place, returns array)
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// mirrors behavioral_opt.py is_valid_run()
function isValidRun(seq, maxRun) {
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    run = (seq[i] === seq[i - 1]) ? run + 1 : 1;
    if (run > maxRun) return false;
  }
  return true;
}

// mirrors behavioral_opt.py constrained_shuffle()
// keyFn: row → string used for run-length check
function constrainedShuffle(rows, keyFn, maxRun = 2, maxTries = 20000) {
  rows = rows.slice();
  for (let attempt = 0; attempt < maxTries; attempt++) {
    shuffleArray(rows);
    if (isValidRun(rows.map(keyFn), maxRun)) return rows;
  }
  console.warn("constrainedShuffle: could not satisfy run constraint; returning best effort.");
  return rows;
}

// mirrors behavioral_opt.py assign_info_types_balanced()
// Greedy approach: for each trial, pick the info type with the smallest
// per-combo count (tiebreak: smallest overall count, tiebreak: random).
// Also enforces the max_run constraint on consecutive identical info types.
function assignInfoTypesBalanced(rows, infoTypes, maxRun = 2, maxTries = 5000) {
  const comboKey = r => `${r.genre}|${r.classification}|${r.price_range}`;

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const overall   = {};
    const perCombo  = {};
    infoTypes.forEach(t => { overall[t] = 0; });

    const assigned = [];
    let ok = true;

    for (let i = 0; i < rows.length; i++) {
      const ck = comboKey(rows[i]);
      if (!perCombo[ck]) {
        perCombo[ck] = {};
        infoTypes.forEach(t => { perCombo[ck][t] = 0; });
      }

      // enforce run constraint
      let candidates = infoTypes.slice();
      if (assigned.length >= maxRun) {
        const last = assigned[assigned.length - 1];
        const allSame = assigned.slice(-maxRun).every(x => x === last);
        if (allSame) candidates = candidates.filter(t => t !== last);
      }
      if (candidates.length === 0) { ok = false; break; }

      // score: [perCombo count, overall count, random tiebreak]
      const scored = candidates.map(t => ({
        t,
        score: [perCombo[ck][t], overall[t], Math.random()],
      }));
      scored.sort((a, b) => {
        for (let k = 0; k < a.score.length; k++) {
          if (a.score[k] !== b.score[k]) return a.score[k] - b.score[k];
        }
        return 0;
      });
      const chosen = scored[0].t;

      assigned.push(chosen);
      overall[chosen]++;
      perCombo[ck][chosen]++;
    }

    if (ok) return assigned;
  }
  throw new Error("assignInfoTypesBalanced: could not satisfy constraints.");
}

// mirrors behavioral_opt.py is_valid_position_runs()
// Checks whether appending `candidate` order to `history` violates
// the per-position max-run constraint.
function isValidPositionRuns(history, candidate, maxRun = 3) {
  for (let pos = 0; pos < candidate.length; pos++) {
    let run = 1;
    for (let h = history.length - 1; h >= 0; h--) {
      if (history[h][pos] === candidate[pos]) {
        run++;
      } else {
        break;
      }
    }
    if (run > maxRun) return false;
  }
  return true;
}

// All permutations of an array (mirrors itertools.permutations)
function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const perm of permutations(rest)) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}

// mirrors behavioral_opt.py build_balanced_question_orders()
function buildBalancedQuestionOrders(allOrders, nTrials, maxRun = 3, maxTries = 5000) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    // build a pool of at least nTrials shuffled copies
    const pool = [];
    while (pool.length < nTrials) {
      const chunk = allOrders.slice();
      shuffleArray(chunk);
      pool.push(...chunk);
    }
    pool.length = nTrials;

    const arranged = [];
    const remaining = pool.slice();

    while (remaining.length > 0) {
      const valid = remaining.filter(o => isValidPositionRuns(arranged, o, maxRun));
      if (valid.length === 0) break;
      const chosen = valid[Math.floor(Math.random() * valid.length)];
      arranged.push(chosen);
      remaining.splice(remaining.indexOf(chosen), 1);
    }

    if (arranged.length === nTrials) return arranged;
  }
  throw new Error("buildBalancedQuestionOrders: could not satisfy position-run constraint.");
}

// ─────────────────────────────────────────────────────────────────────────────
//  6. PSYCHOJS INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────
const psychoJS = new PsychoJS({ debug: false });

psychoJS.start({
  expName : 'EndorsementStudy',
  expInfo : {
    'Participant ID': '',
    'Peer 1': 'A',
    'Peer 2': 'B',
    'Peer 3': 'C',
    'Peer 4': 'D',
  },
  resources: RESOURCES,
});

// ─────────────────────────────────────────────────────────────────────────────
//  7. RESULTS / EVENT LOG  (mirrors behavioral_opt.py results_rows / event_log)
// ─────────────────────────────────────────────────────────────────────────────
const resultsRows = [];
const eventLog    = [];
let   eventCounter = 0;

function logEvent(ID, trialIndex, eventType, stimName, startT, endT, rt = null) {
  eventCounter++;
  // duration only for non-question events (mirrors Python log_event)
  const duration = eventType === "question"
    ? ""
    : (startT != null && endT != null ? endT - startT : "");
  const rtVal = eventType === "question" ? rt : "";

  eventLog.push({
    ID, Trial: trialIndex, EventN: eventCounter,
    EventType: eventType, StimName: stimName,
    StartTime: startT, EndTime: endT,
    Duration: duration, RT: rtVal,
  });
}

function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const header  = Object.keys(rows[0]).join(',');
  const content = [header, ...rows.map(r =>
    Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  )].join('\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href  = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// mirrors behavioral_opt.py flush_csvs() — called after every trial
function flushCSVs(ID) {
  downloadCSV(`Results_${ID}.csv`, resultsRows);
  downloadCSV(`Timing_${ID}.csv`,  eventLog);
}

// ─────────────────────────────────────────────────────────────────────────────
//  8. VISUAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// mirrors behavioral_opt.py make_image_stim():
// Scales the image to fill the window while preserving aspect ratio.
// Reads dimensions from imgCache (HTMLImageElement), which is always
// populated by waitForImage() before the stim is drawn.
function normSize(path) {
  const el = imgCache[path];
  if (el && el.naturalWidth && el.naturalHeight) {
    const iw = el.naturalWidth, ih = el.naturalHeight;
    const ww = window.innerWidth, wh = window.innerHeight;
    const scale = Math.min(ww / iw, wh / ih);
    return [(iw * scale / ww) * 2, (ih * scale / wh) * 2];
  }
  return [2, 2];  // fallback: fill screen (safe for fixation / known square stims)
}

function makeImageStim(win, path) {
  const [wNorm, hNorm] = normSize(path);
  return new visual.ImageStim({
    win, image: path, pos: [0, 0],
    size: [wNorm, hNorm], units: 'norm',
  });
}

// Reuse a single ImageStim by updating its image and size (avoids re-allocation per frame)
function reuseImageStim(stim, path) {
  stim.setImage(path);
  stim.setSize(normSize(path));
}

// ─────────────────────────────────────────────────────────────────────────────
//  9. LIKERT SCALE CLASS  (mirrors behavioral_opt.py LikertScale)
// ─────────────────────────────────────────────────────────────────────────────
class LikertScale {
  constructor(win, leftLabel = '', rightLabel = '') {
    const n    = CFG.scale_n;
    const xs   = Array.from({ length: n }, (_, i) =>
      CFG.scale_x_left + i * (CFG.scale_x_right - CFG.scale_x_left) / (n - 1)
    );
    const r    = CFG.circle_radius;

    this.circles = xs.map(x => new visual.Polygon({
      win, edges: 64, radius: r,
      pos: [x, CFG.scale_y],
      lineColor: new util.Color(CFG.text_color), lineWidth: 4,
      units: 'height',
    }));

    this.numbers = xs.map((x, i) => new visual.TextStim({
      win, text: String(i + 1),
      pos: [x, CFG.numbers_y],
      height: CFG.text_height_medium,
      color: CFG.text_color, font: CFG.font,
      bold: true, alignText: 'center', units: 'height',
    }));

    // Left description: anchor left, offset by 2*radius (mirrors Python scale_x_left - 2*r)
    this.leftDesc = leftLabel ? new visual.TextStim({
      win, text: leftLabel,
      pos: [CFG.scale_x_left - 2 * r, CFG.desc_y],
      height: CFG.text_height_small,
      color: CFG.text_color, font: CFG.font, bold: true,
      alignText: 'left', anchorHoriz: 'left', units: 'height',
    }) : null;

    // Right description: anchor right, offset by +2*radius
    this.rightDesc = rightLabel ? new visual.TextStim({
      win, text: rightLabel,
      pos: [CFG.scale_x_right + 2 * r, CFG.desc_y],
      height: CFG.text_height_small,
      color: CFG.text_color, font: CFG.font, bold: true,
      alignText: 'right', anchorHoriz: 'right', units: 'height',
    }) : null;

    this.current = null;  // 0-based index of selected circle
  }

  reset() { this.current = null; }

  draw() {
    const mid = Math.floor(CFG.scale_n / 2);  // default landing = middle (index 3)
    for (let i = 0; i < this.circles.length; i++) {
      this.circles[i].setFillColor(
        this.current === i ? new util.Color('red') : null
      );
      this.circles[i].draw();
      this.numbers[i].draw();
    }
    if (this.leftDesc)  this.leftDesc.draw();
    if (this.rightDesc) this.rightDesc.draw();
  }

  // mirrors behavioral_opt.py LikertScale.handle_key()
  // Returns true when Enter is pressed with a valid selection.
  handleKey(key) {
    const mid = Math.floor(CFG.scale_n / 2);
    const n   = CFG.scale_n;
    if (key === 'left') {
      this.current = this.current === null ? mid : Math.max(0, this.current - 1);
    } else if (key === 'right') {
      this.current = this.current === null ? mid : Math.min(n - 1, this.current + 1);
    } else if (key === 'return' && this.current !== null) {
      return true;
    }
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  10. SCREEN FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// mirrors behavioral_opt.py show_intro()
async function showIntro(win, path, globalClock) {
  const stim = makeImageStim(win, path);
  while (true) {
    stim.draw();
    win.flip();
    const keys = psychoJS.eventManager.getKeys({ keyList: ['space', 'return', 'escape'] });
    if (keys.includes('escape')) throw new Error('ESCAPE');
    if (keys.includes('space') || keys.includes('return')) return;
    await util.rejs();
  }
}

// mirrors behavioral_opt.py show_image_timed()
// Returns { startT, endT }
async function showImageTimed(win, path, duration, globalClock, labelStim = null) {
  reuseImageStim(win._sharedStim, path);
  const startT = globalClock.getTime();
  while ((globalClock.getTime() - startT) < duration) {
    win._sharedStim.draw();
    if (labelStim) labelStim.draw();
    win.flip();
    if (psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length)
      throw new Error('ESCAPE');
    await util.rejs();
  }
  return { startT, endT: globalClock.getTime() };
}

// mirrors behavioral_opt.py show_fixation()
// Returns { startT, endT }
async function showFixation(win, globalClock, minDur, maxDur) {
  const duration = minDur + Math.random() * (maxDur - minDur);
  reuseImageStim(win._sharedStim, 'stim/00_fixation/fixation.png');
  win._sharedStim.setSize([2, 2]); // fixation fills the screen
  const startT = globalClock.getTime();
  win._sharedStim.draw();
  win.flip();
  // busy-wait (mirrors psychopy core.wait inside checked_wait)
  while ((globalClock.getTime() - startT) < duration) {
    if (psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length)
      throw new Error('ESCAPE');
    await util.rejs();
  }
  return { startT, endT: globalClock.getTime() };
}

// mirrors behavioral_opt.py show_question()
// Returns { score (1-based), rt, startT, endT }
async function showQuestion(win, bgPath, scale, globalClock, labelStim = null) {
  reuseImageStim(win._sharedStim, bgPath);
  scale.reset();
  let startT = null;
  while (true) {
    win._sharedStim.draw();
    if (labelStim) labelStim.draw();
    scale.draw();
    if (startT === null) startT = globalClock.getTime();
    win.flip();
    // Check all three valid keys
    const keys = psychoJS.eventManager.getKeys({ keyList: ['left', 'right', 'return', 'escape'] });
    for (const key of keys) {
      if (key === 'escape') throw new Error('ESCAPE');
      if (scale.handleKey(key)) {
        const endT = globalClock.getTime();
        return { score: scale.current + 1, rt: endT - startT, startT, endT };
      }
    }
    await util.rejs();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  11. MAIN EXPERIMENT
// ─────────────────────────────────────────────────────────────────────────────
async function runExperiment() {
  const win = new visual.Window({
    fullscr: true, color: new util.Color('black'), units: 'norm',
  });

  // A single reusable ImageStim stored on the window object (avoids alloc per frame)
  win._sharedStim = new visual.ImageStim({
    win, pos: [0, 0], size: [2, 2], units: 'norm',
  });

  const globalClock = new core.Clock();

  // Kick off background fetch for all 320 trial images immediately after the
  // window opens. They load in parallel while the intro / participant dialog
  // is shown, so by the time trial 1 starts most images are already in the
  // HTTP cache. warmImageCache() uses plain HTMLImageElement — no PsychoJS
  // involvement, no blocking.
  warmImageCache();

  // ── Endorsement label stim (reused for info + question screens) ────────────
  // mirrors behavioral_opt.py make_info_label()
  const labelStim = new visual.TextStim({
    win, text: '',
    pos: [CFG.label_x, CFG.label_y],
    height: CFG.text_height_big,
    color: CFG.text_color, font: CFG.font,
    bold: true, alignText: 'left', anchorHoriz: 'left', anchorVert: 'top',
    units: 'norm',
  });
  function setLabel(text) {
    labelStim.setText(text || '');
  }

  // ── Build Likert scales once (reused every trial) ──────────────────────────
  // mirrors behavioral_opt.py main() scales dict
  const scales = {
    credEX   : new LikertScale(win, "전혀 전문적이지 않다", "매우 전문적이다"),
    credCON  : new LikertScale(win, "전혀 반영하지 않는다", "매우 반영한다"),
    credPEER : new LikertScale(win, "전혀 가깝지 않다",     "매우 가깝다"),
    credGen  : new LikertScale(win, "전혀 믿지 않음",       "매우 신뢰함"),
    preference: new LikertScale(win, "전혀 선호하지 않음",  "매우 선호함"),
  };

  const ID = psychoJS.extraInfo['Participant ID'];
  const peerNames = [1, 2, 3, 4].map(i => psychoJS.extraInfo[`Peer ${i}`]);

  // ── Load expert_labels.csv ─────────────────────────────────────────────────
  // mirrors behavioral_opt.py expert_label_map construction.
  // CSV has NO header: each line is "product name,label"  (product uses spaces, not underscores)
  const expertLabelMap = {};
  try {
    const resp      = await fetch('expert_labels.csv');
    const labelData = await resp.text();
    for (const line of labelData.split(/\r?\n/)) {
      const commaIdx = line.indexOf(',');
      if (commaIdx === -1) continue;
      const product = norm(line.slice(0, commaIdx));      // norm() matches Python
      const label   = line.slice(commaIdx + 1).trim();
      if (product && label) expertLabelMap[product] = label;
    }
  } catch (e) {
    console.error("Failed to load expert_labels.csv:", e);
  }

  // ── Load product list via TrialHandler ─────────────────────────────────────
  const trialHandler = new TrialHandler({
    psychoJS, nReps: 1,
    method: TrialHandler.Method.SEQUENTIAL,
    trialList: 'product_list.csv',
  });

  // mirrors behavioral_opt.py: constrained_shuffle keyed on (genre, classification, price_range)
  let rows = constrainedShuffle(
    trialHandler.trialList.map(r => ({ ...r })),
    r => `${r.genre}|${r.classification}|${r.price_range}`,
    CFG.max_run,
  );

  const nTrials = rows.length;

  // ── Assign info types ──────────────────────────────────────────────────────
  // mirrors behavioral_opt.py assign_info_types_balanced()
  const infoAssignment = assignInfoTypesBalanced(
    rows, Object.keys(INFO_CODE_MAP), CFG.max_run,
  );

  // ── Build balanced question order pools ────────────────────────────────────
  // mirrors behavioral_opt.py build_balanced_question_orders() called twice
  const ALL_ORDERS_GPT   = permutations(GPT_QUESTIONS);
  const ALL_ORDERS_OTHER = permutations(OTHER_QUESTIONS);

  const balancedOrdersGpt   = buildBalancedQuestionOrders(
    ALL_ORDERS_GPT,   nTrials, CFG.question_order_max_run,
  );
  const balancedOrdersOther = buildBalancedQuestionOrders(
    ALL_ORDERS_OTHER, nTrials, CFG.question_order_max_run,
  );
  let gptCounter   = 0;
  let otherCounter = 0;

  // ── Intro + opening fixation ───────────────────────────────────────────────
  // mirrors behavioral_opt.py: show_intro → show_fixation(3, 3)
  try {
    await showIntro(win, 'stim/04_intro/intro.png', globalClock);
    await showFixation(win, globalClock, 3, 3);  // fixed 3-sec opening fixation

    // ── Trial loop ─────────────────────────────────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      const trial    = rows[i];
      const tIdx     = i + 1;
      const infoType = infoAssignment[i];

      // ── 1. Product image ─────────────────────────────────────────────────
      // mirrors behavioral_opt.py: show_image_timed(win, prod_path, product_dur)
      // No label during product display.
      const prodPath = `stim/01_product/${trial.product_ENG.trim()}.png`;
      await waitForImage(prodPath);   // ensure cached before drawing
      setLabel(null);
      const { startT: pst, endT: pet } =
        await showImageTimed(win, prodPath, CFG.product_dur, globalClock, null);
      logEvent(ID, tIdx, "product", `${trial.product_ENG}.png`, pst, pet);

      // ── 2. Fixation ──────────────────────────────────────────────────────
      const { startT: fst1, endT: fet1 } =
        await showFixation(win, globalClock, CFG.fix_min, CFG.fix_max);
      logEvent(ID, tIdx, "fixation", "fixation.png", fst1, fet1);

      // ── 3. Resolve endorsement label ─────────────────────────────────────
      // mirrors behavioral_opt.py:
      //   peer_name  = random.choice(peer_names) if info_type == "peer" else None
      //   expert_label = expert_label_map.get(norm(trial["product_ENG"])) if info_type == "expert" else None
      //   label_text = resolve_label(...)
      const peerName = (infoType === "peer")
        ? peerNames[Math.floor(Math.random() * peerNames.length)]
        : null;
      const expertLabel = (infoType === "expert")
        ? (expertLabelMap[norm(trial.product_ENG)] || null)
        : null;
      const labelText = resolveLabel(infoType, peerName, expertLabel);

      // ── 4. Endorsement information image ─────────────────────────────────
      // mirrors behavioral_opt.py:
      //   suffix = INFO_CODE_MAP[info_type]
      //   product_stem = os.path.splitext(trial["ProductFilePath"])[0]
      //   info_fname = f"{product_stem}_{suffix}.png"
      const suffix   = INFO_CODE_MAP[infoType];
      const infoPath = `stim/02_information/${trial.product_ENG.trim()}_${suffix}.png`;
      await waitForImage(infoPath);   // ensure cached before drawing
      setLabel(labelText);
      const { startT: ist, endT: iet } =
        await showImageTimed(win, infoPath, CFG.info_dur, globalClock, labelText ? labelStim : null);
      logEvent(ID, tIdx, "info", `${trial.product_ENG}_${suffix}.png`, ist, iet);

      // ── 5. Fixation ──────────────────────────────────────────────────────
      const { startT: fst2, endT: fet2 } =
        await showFixation(win, globalClock, CFG.fix_min, CFG.fix_max);
      logEvent(ID, tIdx, "fixation", "fixation.png", fst2, fet2);

      // ── 6. Questions ──────────────────────────────────────────────────────
      // mirrors behavioral_opt.py:
      //   if info_type == "gpt": q_order = list(balanced_orders_gpt[gpt_counter % ...])
      //   else:                  q_order = list(balanced_orders_other[other_counter % ...])
      let qOrder;
      if (infoType === "gpt") {
        qOrder = balancedOrdersGpt[gptCounter % balancedOrdersGpt.length].slice();
        gptCounter++;
      } else {
        qOrder = balancedOrdersOther[otherCounter % balancedOrdersOther.length].slice();
        otherCounter++;
      }

      const results = {};
      for (const qKey of qOrder) {
        const qDef  = QUESTION_DEFS[qKey];
        const bgPath = `stim/03_question/${qDef.bg}`;

        // label is shown on question screens too (mirrors behavioral_opt.py run_question)
        const { score, rt, startT: qst, endT: qet } =
          await showQuestion(win, bgPath, scales[qKey], globalClock, labelText ? labelStim : null);
        results[qKey] = { score, rt };
        logEvent(ID, tIdx, "question", qKey, qst, qet, rt);

        // fixation after each question (mirrors behavioral_opt.py loop)
        const { startT: fstQ, endT: fetQ } =
          await showFixation(win, globalClock, CFG.fix_min, CFG.fix_max);
        logEvent(ID, tIdx, "fixation", "fixation.png", fstQ, fetQ);
      }

      // ── 7. Save results row ───────────────────────────────────────────────
      // mirrors behavioral_opt.py results_rows.append(dict(...))
      const g   = k => results[k]?.score ?? '';
      const grt = k => results[k]?.rt    ?? '';

      resultsRows.push({
        TrialNumber            : tIdx,
        product_ENG            : trial.product_ENG,
        product_KOR            : trial.product_KOR,
        genre                  : trial.genre,
        classification         : trial.classification,
        price_range            : trial.price_range,
        InfoType               : infoType,
        Q_Order                : qOrder.join('-'),
        Credibility_EX         : g('credEX'),
        Credibility_CON        : g('credCON'),
        Credibility_PEER       : g('credPEER'),
        Credibility_general    : g('credGen'),
        Preference             : g('preference'),
        Credibility_EX_RT      : grt('credEX'),
        Credibility_CON_RT     : grt('credCON'),
        Credibility_PEER_RT    : grt('credPEER'),
        Credibility_general_RT : grt('credGen'),
        Preference_RT          : grt('preference'),
      });

      // mirrors behavioral_opt.py flush_csvs() called after every trial
      flushCSVs(ID);
    }

    psychoJS.quit({ message: 'Success', isCompleted: true });

  } catch (e) {
    if (e.message !== 'ESCAPE') console.error(e);
    // mirrors behavioral_opt.py finally block: flush on exit regardless
    flushCSVs(ID);
    psychoJS.quit({ message: 'Aborted', isCompleted: false });
  }
}

runExperiment();

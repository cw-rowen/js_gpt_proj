/**
 * experiment.js
 * Endorsement Study — PsychoJS / Pavlovia
 *
 * Mirrors behavioral_opt.py exactly.
 * Uses the Scheduler-based pattern (samplesetup.js) to fix the
 * [Init] Please wait… hang that the previous async/await version caused.
 */

import { core, data, util, visual } from './lib/psychojs-2024.1.4.js';
const { PsychoJS } = core;
const { TrialHandler } = data;
const { Scheduler } = util;

// ─────────────────────────────────────────────────────────────────────────────
//  1. CONFIGURATION  (mirrors behavioral_opt.py CFG dict)
// ─────────────────────────────────────────────────────────────────────────────
const CFG = {
  // timing
  product_dur  : 4.0,
  info_dur     : 9.0,
  fix_min      : 0.5,
  fix_max      : 1.5,

  // randomization
  max_run                : 2,
  question_order_max_run : 3,

  // text
  font               : 'NanumGothic',
  text_color         : 'white',
  text_height_big    : 0.15,   // endorsement label  (norm units)
  text_height_medium : 0.045,  // Likert numbers     (height units)
  text_height_small  : 0.05,   // Likert endpoint    (height units)

  // scale — all scale elements use 'height' units, matching Python
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
  expert    : '01',
  consensus : '02',
  peer      : '03',
  gpt       : '04',
};

const INFO_LABEL_MAP = {
  consensus : '[소비자 의견 종합]',
  gpt       : '[ChatGPT]',
  // expert resolved dynamically from expert_labels.csv
  // peer   resolved dynamically from participant dialog
};

// ─────────────────────────────────────────────────────────────────────────────
//  3. QUESTION DEFINITIONS  (mirrors behavioral_opt.py QUESTION_DEFS)
// ─────────────────────────────────────────────────────────────────────────────
const QUESTION_DEFS = {
  credEX   : { bg: 'credibility_EX.png',      left: '전혀 전문적이지 않다', right: '매우 전문적이다' },
  credCON  : { bg: 'credibility_CON.png',      left: '전혀 반영하지 않는다', right: '매우 반영한다'   },
  credPEER : { bg: 'credibility_PEER.png',     left: '전혀 가깝지 않다',     right: '매우 가깝다'     },
  credGen  : { bg: 'credibility_general.png',  left: '전혀 믿지 않음',       right: '매우 신뢰함'     },
  preference: { bg: 'preference.png',          left: '전혀 선호하지 않음',   right: '매우 선호함'     },
};

// GPT gets all 5 Qs; all other endorsers get 2  (mirrors behavioral_opt.py)
const GPT_QUESTIONS   = ['credEX', 'credCON', 'credPEER', 'credGen', 'preference'];
const OTHER_QUESTIONS = ['credGen', 'preference'];

// ─────────────────────────────────────────────────────────────────────────────
//  4. RESOURCE MANIFEST
//
//  Only the small static assets are declared here (CSVs + fixation + intro +
//  5 question PNGs = 9 files).  Trial images (64 products × 4 info codes =
//  320 files) are NOT listed — that is what caused the [Init] hang.
//  They are pre-fetched via the browser's native image cache (imgCache) after
//  Init completes, so they are warm before each trial needs them.
// ─────────────────────────────────────────────────────────────────────────────
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
// Total: 2 + 2 + 5 = 9 resources — Init finishes immediately.

// ─────────────────────────────────────────────────────────────────────────────
//  4b. BACKGROUND IMAGE CACHE
//
//  Pre-fetches all 320 trial images using native HTMLImageElement so the
//  browser HTTP cache has them ready before each trial draws them.
//  Zero PsychoJS involvement — no blocking, no Init overhead.
// ─────────────────────────────────────────────────────────────────────────────
const PRODUCTS = [
  'airfryer','bath_bomb','body_lotion','body_mist','bread','cable_organizer','cake','canned_tuna',
  'caviar','chips','chocolate','cookies','cup_ramen','decorative_magnet','decorative_tape','disposable_camera',
  'egronomics_chair_seat','egyptian_cotton_sheets_set','electric_toothbrush','fountain_pen','frozen_pizza',
  'gaming_console','hair_brush','instant_coffee','instant_coffee_maker','laptop_stand','leather_notebook',
  'LED_mood_light','lip_balm','luxury_perfume','mango_set','manuka_honey','massaging_roller','memo_pads',
  'mini_camera','mouse_pad','multitab','oil_pastels','organic_olive_oil','paper_weight','pen',
  'portable_charger','portable_humidifier','projector','rc_car','roll-on_mini_perfume','scented_hand_cream',
  'scientific_calculator','shampoo','singing_bowl','skin_care_device','SSD_external_storage','stamp',
  'steak_500g','stickers','supplements','tablet','tea_gift_set','vacuum_cleaner','VR_headset',
  'wax_burner','wax_seal_kit','weighted_blanket','wireless_keyboard',
];

const imgCache = {};   // keyed by URL — keeps HTMLImageElement refs alive

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
      el.src = url;
      imgCache[url] = el;
    }
  }
}

function waitForImage(url) {
  const el = imgCache[url] || (() => {
    const fresh = new Image();
    fresh.src = url;
    imgCache[url] = fresh;
    return fresh;
  })();
  if (el.complete && el.naturalWidth > 0) return Promise.resolve();
  return new Promise(resolve => { el.onload = resolve; el.onerror = resolve; });
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. HELPERS  (mirrors behavioral_opt.py helpers section)
// ─────────────────────────────────────────────────────────────────────────────

// mirrors behavioral_opt.py norm()
function normStr(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

// mirrors behavioral_opt.py resolve_label()
function resolveLabel(infoType, peerName, expertLabel) {
  if (infoType === 'peer')   return peerName    ? `[${peerName}의 추천]` : null;
  if (infoType === 'expert') return expertLabel || INFO_LABEL_MAP['expert'] || null;
  return INFO_LABEL_MAP[infoType] || null;
}

// Fisher-Yates in-place shuffle
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
    run = seq[i] === seq[i - 1] ? run + 1 : 1;
    if (run > maxRun) return false;
  }
  return true;
}

// mirrors behavioral_opt.py constrained_shuffle()
function constrainedShuffle(rows, keyFn, maxRun = 2, maxTries = 20000) {
  rows = rows.slice();
  for (let attempt = 0; attempt < maxTries; attempt++) {
    shuffleArray(rows);
    if (isValidRun(rows.map(keyFn), maxRun)) return rows;
  }
  console.warn('constrainedShuffle: returning best-effort order');
  return rows;
}

// mirrors behavioral_opt.py assign_info_types_balanced()
function assignInfoTypesBalanced(rows, infoTypes, maxRun = 2, maxTries = 5000) {
  const comboKey = r => `${r.genre}|${r.classification}|${r.price_range}`;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const overall = {};
    const perCombo = {};
    infoTypes.forEach(t => { overall[t] = 0; });
    const assigned = [];
    let ok = true;
    for (let i = 0; i < rows.length; i++) {
      const ck = comboKey(rows[i]);
      if (!perCombo[ck]) { perCombo[ck] = {}; infoTypes.forEach(t => { perCombo[ck][t] = 0; }); }
      let candidates = infoTypes.slice();
      if (assigned.length >= maxRun && assigned.slice(-maxRun).every(x => x === assigned[assigned.length - 1])) {
        candidates = candidates.filter(t => t !== assigned[assigned.length - 1]);
      }
      if (candidates.length === 0) { ok = false; break; }
      const scored = candidates.map(t => ({ t, s: [perCombo[ck][t], overall[t], Math.random()] }));
      scored.sort((a, b) => { for (let k = 0; k < 3; k++) if (a.s[k] !== b.s[k]) return a.s[k] - b.s[k]; return 0; });
      const chosen = scored[0].t;
      assigned.push(chosen);
      overall[chosen]++;
      perCombo[ck][chosen]++;
    }
    if (ok) return assigned;
  }
  throw new Error('assignInfoTypesBalanced: could not satisfy constraints');
}

// mirrors behavioral_opt.py is_valid_position_runs()
function isValidPositionRuns(history, candidate, maxRun = 3) {
  for (let pos = 0; pos < candidate.length; pos++) {
    let run = 1;
    for (let h = history.length - 1; h >= 0; h--) {
      if (history[h][pos] === candidate[pos]) run++;
      else break;
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
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

// mirrors behavioral_opt.py build_balanced_question_orders()
function buildBalancedQuestionOrders(allOrders, nTrials, maxRun = 3, maxTries = 5000) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const pool = [];
    while (pool.length < nTrials) { const c = allOrders.slice(); shuffleArray(c); pool.push(...c); }
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
  throw new Error('buildBalancedQuestionOrders: could not satisfy position-run constraint');
}

// ─────────────────────────────────────────────────────────────────────────────
//  6. RESULTS / EVENT LOG  (mirrors behavioral_opt.py results_rows / event_log)
// ─────────────────────────────────────────────────────────────────────────────
const resultsRows = [];
const eventLog    = [];
let   eventCounter = 0;

// mirrors behavioral_opt.py log_event()
function logEvent(ID, trialIndex, eventType, stimName, startT, endT, rt = null) {
  eventCounter++;
  const duration = eventType === 'question' ? '' : (startT != null && endT != null ? endT - startT : '');
  const rtVal    = eventType === 'question' ? rt : '';
  eventLog.push({ ID, Trial: trialIndex, EventN: eventCounter,
    EventType: eventType, StimName: stimName,
    StartTime: startT, EndTime: endT, Duration: duration, RT: rtVal });
}

// mirrors behavioral_opt.py flush_csvs() — triggers browser download after every trial
function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const header  = Object.keys(rows[0]).join(',');
  const content = [header, ...rows.map(r =>
    Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  )].join('\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function flushCSVs(ID) {
  downloadCSV(`Results_${ID}.csv`, resultsRows);
  downloadCSV(`Timing_${ID}.csv`,  eventLog);
}

// ─────────────────────────────────────────────────────────────────────────────
//  7. PSYCHOJS INITIALIZATION  (Scheduler pattern — mirrors samplesetup.js)
// ─────────────────────────────────────────────────────────────────────────────
const psychoJS = new PsychoJS({ debug: false });

// Step 1 — open window (must happen before scheduling)
psychoJS.openWindow({
  fullscr         : true,
  color           : new util.Color('black'),
  units           : 'norm',
  waitBlanking    : true,
  backgroundImage : '',
  backgroundFit   : 'none',
});

// Step 2 — participant dialog  (mirrors behavioral_opt.py gui.DlgFromDict)
const expName = 'EndorsementStudy';
const expInfo = {
  'Participant ID': '',
  'Peer 1': 'Peer1',
  'Peer 2': 'Peer2',
  'Peer 3': 'Peer3',
  'Peer 4': 'Peer4',
};

psychoJS.schedule(psychoJS.gui.DlgFromDict({ dictionary: expInfo, title: expName }));

// Step 3 — two top-level schedulers (OK / Cancel), exactly as in samplesetup.js
const flowScheduler         = new Scheduler(psychoJS);
const dialogCancelScheduler = new Scheduler(psychoJS);

psychoJS.scheduleCondition(
  () => psychoJS.gui.dialogComponent.button === 'OK',
  flowScheduler,
  dialogCancelScheduler
);

// flowScheduler — runs when participant clicks OK
flowScheduler.add(updateInfo);
flowScheduler.add(experimentInit);
flowScheduler.add(introRoutineBegin());
flowScheduler.add(introRoutineEachFrame());
flowScheduler.add(introRoutineEnd());
flowScheduler.add(openingFixationRoutineBegin());
flowScheduler.add(openingFixationRoutineEachFrame());
flowScheduler.add(openingFixationRoutineEnd());

const trialsLoopScheduler = new Scheduler(psychoJS);
flowScheduler.add(trialsLoopBegin(trialsLoopScheduler));
flowScheduler.add(trialsLoopScheduler);
flowScheduler.add(trialsLoopEnd);
flowScheduler.add(quitPsychoJS, 'Experiment complete', true);

// dialogCancelScheduler — runs when participant clicks Cancel
dialogCancelScheduler.add(quitPsychoJS, 'Cancelled', false);

// Step 4 — start PsychoJS with only the 9 static resources (fixes the hang)
psychoJS.start({ expName, expInfo, resources: RESOURCES });

// ─────────────────────────────────────────────────────────────────────────────
//  8. SHARED STATE  (populated in experimentInit, used across routines)
// ─────────────────────────────────────────────────────────────────────────────
let globalClock;
let routineTimer;

// Reusable stims (allocated once in experimentInit, reused every routine)
let sharedImageStim;    // for product / info / fixation / intro images
let labelStim;          // endorsement source label
let scales;             // { credEX, credCON, credPEER, credGen, preference }

// Trial data (built in experimentInit)
let trialRows     = [];
let infoAssignment = [];
let balancedOrdersGpt;
let balancedOrdersOther;
let gptCounter   = 0;
let otherCounter = 0;
let expertLabelMap = {};
let peerNames = [];
let participantID = '';

// Per-routine state
let routineActive;
let routineClock;

// Per-trial state (set at the start of each trial routine)
let currentTrial;
let currentTrialIdx;
let currentInfoType;
let currentLabelText;
let currentQOrder;
let currentQIdx;
let currentQResults;

// Sub-routine phases within the trial (enumerated for the EachFrame dispatch)
// Phase sequence per trial mirrors behavioral_opt.py trial loop exactly:
//   PRODUCT → FIX1 → INFO → FIX2 → QUESTION(s) with inter-question FIX
const Phase = Object.freeze({
  PRODUCT  : 'PRODUCT',
  FIX1     : 'FIX1',
  INFO     : 'INFO',
  FIX2     : 'FIX2',
  QUESTION : 'QUESTION',
  QFIX     : 'QFIX',
  DONE     : 'DONE',
});
let trialPhase;
let phaseStartT;
let phaseDuration;

// Likert state within a question
let likeratCurrent;      // 0-based index of selected circle
let questionStartT;

// ─────────────────────────────────────────────────────────────────────────────
//  9. VISUAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// mirrors behavioral_opt.py make_image_stim() aspect-ratio-preserving scale
function normSize(url) {
  const el = imgCache[url];
  if (el && el.naturalWidth && el.naturalHeight) {
    const iw = el.naturalWidth, ih = el.naturalHeight;
    const ww = window.innerWidth,  wh = window.innerHeight;
    const sc = Math.min(ww / iw, wh / ih);
    return [(iw * sc / ww) * 2, (ih * sc / wh) * 2];
  }
  return [2, 2];  // safe fallback — fills screen
}

function applyImageToShared(path) {
  sharedImageStim.setImage(path);
  sharedImageStim.setSize(normSize(path));
}

function setLabelText(text) {
  labelStim.setText(text || '');
  labelStim.setOpacity(text ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
//  10. LIKERT SCALE CLASS  (mirrors behavioral_opt.py LikertScale)
// ─────────────────────────────────────────────────────────────────────────────
class LikertScale {
  constructor(win, leftLabel = '', rightLabel = '') {
    const n  = CFG.scale_n;
    const xs = Array.from({ length: n }, (_, i) =>
      CFG.scale_x_left + i * (CFG.scale_x_right - CFG.scale_x_left) / (n - 1)
    );
    const r = CFG.circle_radius;

    this.circles = xs.map(x => new visual.Polygon({
      win, edges: 64, radius: r,
      pos: [x, CFG.scale_y],
      lineColor: new util.Color(CFG.text_color), lineWidth: 4,
      fillColor: null, units: 'height',
    }));

    this.numbers = xs.map((x, i) => new visual.TextStim({
      win, text: String(i + 1),
      pos: [x, CFG.numbers_y],
      height: CFG.text_height_medium,
      color: CFG.text_color, font: CFG.font, bold: true,
      alignText: 'center', units: 'height',
    }));

    this.leftDesc = leftLabel ? new visual.TextStim({
      win, text: leftLabel,
      pos: [CFG.scale_x_left - 2 * r, CFG.desc_y],
      height: CFG.text_height_small,
      color: CFG.text_color, font: CFG.font, bold: true,
      alignText: 'left', anchorHoriz: 'left', units: 'height',
    }) : null;

    this.rightDesc = rightLabel ? new visual.TextStim({
      win, text: rightLabel,
      pos: [CFG.scale_x_right + 2 * r, CFG.desc_y],
      height: CFG.text_height_small,
      color: CFG.text_color, font: CFG.font, bold: true,
      alignText: 'right', anchorHoriz: 'right', units: 'height',
    }) : null;

    this.current = null;
  }

  reset() { this.current = null; }

  draw() {
    for (let i = 0; i < this.circles.length; i++) {
      this.circles[i].setFillColor(this.current === i ? new util.Color('red') : null);
      this.circles[i].draw();
      this.numbers[i].draw();
    }
    if (this.leftDesc)  this.leftDesc.draw();
    if (this.rightDesc) this.rightDesc.draw();
  }

  // mirrors behavioral_opt.py LikertScale.handle_key()
  // Returns true when Enter is pressed with a selection
  handleKey(key) {
    const mid = Math.floor(CFG.scale_n / 2);
    const n   = CFG.scale_n;
    if      (key === 'left')                           this.current = this.current === null ? mid : Math.max(0, this.current - 1);
    else if (key === 'right')                          this.current = this.current === null ? mid : Math.min(n - 1, this.current + 1);
    else if (key === 'return' && this.current !== null) return true;
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  11. SCHEDULER HOOKS
// ─────────────────────────────────────────────────────────────────────────────

async function updateInfo() {
  expInfo['date']          = util.MonotonicClock.getDateStr();
  expInfo['expName']       = expName;
  expInfo['psychopyVersion'] = '2024.1.4';
  expInfo['OS']            = window.navigator.platform;
  psychoJS.experiment.dataFileName = `data/${expInfo['Participant ID']}_${expName}_${expInfo['date']}`;
  psychoJS.experiment.field_separator = '\t';
  return Scheduler.Event.NEXT;
}

async function experimentInit() {
  // ── Clocks ────────────────────────────────────────────────────────────────
  globalClock  = new util.Clock();
  routineTimer = new util.CountdownTimer();

  // ── Validate participant ID ────────────────────────────────────────────────
  participantID = String(expInfo['Participant ID']).trim();
  if (!participantID) {
    alert('Participant ID cannot be empty.');
    return quitPsychoJS('No participant ID', false);
  }

  peerNames = [1, 2, 3, 4].map(i => String(expInfo[`Peer ${i}`]).trim());
  if (peerNames.some(n => !n)) {
    alert('All four peer name fields must be filled in.');
    return quitPsychoJS('Missing peer names', false);
  }

  // ── Warm background image cache immediately ────────────────────────────────
  // mirrors behavioral_opt.py: starts fetching all 320 trial images in the
  // background while intro/setup continues, so they are ready by trial time.
  warmImageCache();

  // ── Allocate reusable stims (once, mirrors LikertScale and label alloc) ────
  const win = psychoJS.window;

  sharedImageStim = new visual.ImageStim({
    win, pos: [0, 0], size: [2, 2], units: 'norm',
  });

  labelStim = new visual.TextStim({
    win, text: '',
    pos: [CFG.label_x, CFG.label_y],
    height: CFG.text_height_big,
    color: CFG.text_color, font: CFG.font,
    bold: true, alignText: 'left', anchorHoriz: 'left', anchorVert: 'top',
    units: 'norm', opacity: 0,
  });

  // mirrors behavioral_opt.py main() scales dict
  scales = {
    credEX    : new LikertScale(win, '전혀 전문적이지 않다', '매우 전문적이다'),
    credCON   : new LikertScale(win, '전혀 반영하지 않는다', '매우 반영한다'),
    credPEER  : new LikertScale(win, '전혀 가깝지 않다',     '매우 가깝다'),
    credGen   : new LikertScale(win, '전혀 믿지 않음',       '매우 신뢰함'),
    preference: new LikertScale(win, '전혀 선호하지 않음',   '매우 선호함'),
  };

  // ── Load expert_labels.csv ─────────────────────────────────────────────────
  // mirrors behavioral_opt.py expert_label_map: { norm(product_ENG) → label }
  // File naming: stim/02_information/expert_labels.csv  (no header; product,label)
  try {
    const raw = psychoJS.serverManager.getResource('expert_labels.csv');
    // PsychoJS returns file content as a string after preloading
    const text = (typeof raw === 'string') ? raw : new TextDecoder().decode(raw);
    for (const line of text.split(/\r?\n/)) {
      const ci = line.indexOf(',');
      if (ci === -1) continue;
      const product = normStr(line.slice(0, ci));
      const label   = line.slice(ci + 1).trim();
      if (product && label) expertLabelMap[product] = label;
    }
  } catch (e) {
    console.error('Failed to parse expert_labels.csv:', e);
  }

  // ── Load product_list.csv via TrialHandler ─────────────────────────────────
  // mirrors behavioral_opt.py pd.read_excel() → df.to_dict('records')
  const th = new TrialHandler({
    psychoJS, nReps: 1,
    method: TrialHandler.Method.SEQUENTIAL,
    trialList: 'product_list.csv',
  });

  // mirrors behavioral_opt.py constrained_shuffle(rows, key_fn=genre|class|price, max_run=2)
  trialRows = constrainedShuffle(
    th.trialList.map(r => ({ ...r })),
    r => `${r.genre}|${r.classification}|${r.price_range}`,
    CFG.max_run,
  );

  const nTrials = trialRows.length;

  // mirrors behavioral_opt.py assign_info_types_balanced()
  infoAssignment = assignInfoTypesBalanced(trialRows, Object.keys(INFO_CODE_MAP), CFG.max_run);

  // mirrors behavioral_opt.py build_balanced_question_orders() called twice
  const ALL_GPT   = permutations(GPT_QUESTIONS);
  const ALL_OTHER = permutations(OTHER_QUESTIONS);

  balancedOrdersGpt   = buildBalancedQuestionOrders(ALL_GPT,   nTrials, CFG.question_order_max_run);
  balancedOrdersOther = buildBalancedQuestionOrders(ALL_OTHER, nTrials, CFG.question_order_max_run);

  gptCounter   = 0;
  otherCounter = 0;

  return Scheduler.Event.NEXT;
}

// ─────────────────────────────────────────────────────────────────────────────
//  12. INTRO ROUTINE  (mirrors behavioral_opt.py show_intro)
//  Displays stim/04_intro/intro.png; advances on Space or Return.
// ─────────────────────────────────────────────────────────────────────────────
let introKb;

function introRoutineBegin() {
  return async function () {
    routineActive = true;
    routineClock  = new util.Clock();

    applyImageToShared('stim/04_intro/intro.png');
    setLabelText(null);

    introKb = new core.Keyboard({ psychoJS, clock: routineClock, waitForStart: true });

    sharedImageStim.setAutoDraw(true);

    introKb.clock.reset();
    introKb.start();
    introKb.clearEvents();

    return Scheduler.Event.NEXT;
  };
}

function introRoutineEachFrame() {
  return async function () {
    if (psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape', false);

    const keys = introKb.getKeys({ keyList: ['space', 'return'], waitRelease: false });
    if (keys.length > 0) routineActive = false;

    if (!routineActive) {
      return Scheduler.Event.NEXT;
    }
    return Scheduler.Event.FLIP_REPEAT;
  };
}

function introRoutineEnd() {
  return async function () {
    sharedImageStim.setAutoDraw(false);
    introKb.stop();
    return Scheduler.Event.NEXT;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  13. OPENING FIXATION ROUTINE  (mirrors behavioral_opt.py show_fixation(3,3))
// ─────────────────────────────────────────────────────────────────────────────
function openingFixationRoutineBegin() {
  return async function () {
    routineClock = new util.Clock();
    applyImageToShared('stim/00_fixation/fixation.png');
    sharedImageStim.setSize([2, 2]);
    setLabelText(null);
    sharedImageStim.setAutoDraw(true);
    routineTimer.add(3.0);
    return Scheduler.Event.NEXT;
  };
}

function openingFixationRoutineEachFrame() {
  return async function () {
    if (psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape', false);
    if (routineTimer.getTime() <= 0) return Scheduler.Event.NEXT;
    return Scheduler.Event.FLIP_REPEAT;
  };
}

function openingFixationRoutineEnd() {
  return async function () {
    sharedImageStim.setAutoDraw(false);
    return Scheduler.Event.NEXT;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  14. TRIAL LOOP  (mirrors behavioral_opt.py for t_idx, trial in enumerate(trials))
// ─────────────────────────────────────────────────────────────────────────────
function trialsLoopBegin(loopScheduler) {
  return async function () {
    for (let i = 0; i < trialRows.length; i++) {
      loopScheduler.add(trialRoutineBegin(i));
      loopScheduler.add(trialRoutineEachFrame());
      loopScheduler.add(trialRoutineEnd(i));
    }
    loopScheduler.add(async () => Scheduler.Event.NEXT);
    return Scheduler.Event.NEXT;
  };
}

async function trialsLoopEnd() {
  return Scheduler.Event.NEXT;
}

// ─────────────────────────────────────────────────────────────────────────────
//  15. TRIAL ROUTINE  (one routine handles all phases of a single trial)
//
//  Phase sequence (mirrors behavioral_opt.py trial loop body exactly):
//    PRODUCT → FIX1 → INFO → FIX2 → QUESTION → QFIX → … → DONE
//
//  Each EachFrame call advances the phase when the duration/keypress condition
//  is met, exactly replicating the Python while-loop structure.
// ─────────────────────────────────────────────────────────────────────────────
let trialKb;

function trialRoutineBegin(trialIdx) {
  return async function () {
    currentTrial    = trialRows[trialIdx];
    currentTrialIdx = trialIdx + 1;   // 1-based, mirrors Python t_idx

    // ── Resolve endorsement type & label (mirrors behavioral_opt.py) ──────
    currentInfoType = infoAssignment[trialIdx];

    const peerName = (currentInfoType === 'peer')
      ? peerNames[Math.floor(Math.random() * peerNames.length)]
      : null;
    const expertLabel = (currentInfoType === 'expert')
      ? (expertLabelMap[normStr(currentTrial.product_ENG)] || null)
      : null;
    currentLabelText = resolveLabel(currentInfoType, peerName, expertLabel);

    // ── Pick question order (mirrors behavioral_opt.py gpt/other counter) ─
    if (currentInfoType === 'gpt') {
      currentQOrder = balancedOrdersGpt[gptCounter % balancedOrdersGpt.length].slice();
      gptCounter++;
    } else {
      currentQOrder = balancedOrdersOther[otherCounter % balancedOrdersOther.length].slice();
      otherCounter++;
    }

    currentQIdx     = 0;
    currentQResults = {};

    // ── Keyboard (shared across all phases) ───────────────────────────────
    trialKb = new core.Keyboard({ psychoJS, clock: globalClock, waitForStart: true });
    trialKb.start();
    trialKb.clearEvents();

    // ── Start PRODUCT phase ───────────────────────────────────────────────
    await waitForImage(`stim/01_product/${currentTrial.product_ENG.trim()}.png`);
    _beginProductPhase();

    return Scheduler.Event.NEXT;
  };
}

// ── Phase-begin helpers ───────────────────────────────────────────────────────

function _beginProductPhase() {
  trialPhase    = Phase.PRODUCT;
  phaseDuration = CFG.product_dur;
  phaseStartT   = globalClock.getTime();
  applyImageToShared(`stim/01_product/${currentTrial.product_ENG.trim()}.png`);
  setLabelText(null);
  sharedImageStim.setAutoDraw(true);
  labelStim.setAutoDraw(false);
}

function _beginFixPhase(nextPhase) {
  trialPhase    = nextPhase;
  phaseDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
  phaseStartT   = globalClock.getTime();
  applyImageToShared('stim/00_fixation/fixation.png');
  sharedImageStim.setSize([2, 2]);
  setLabelText(null);
  sharedImageStim.setAutoDraw(true);
  labelStim.setAutoDraw(false);
}

async function _beginInfoPhase() {
  const suffix   = INFO_CODE_MAP[currentInfoType];
  const infoPath = `stim/02_information/${currentTrial.product_ENG.trim()}_${suffix}.png`;
  await waitForImage(infoPath);
  trialPhase    = Phase.INFO;
  phaseDuration = CFG.info_dur;
  phaseStartT   = globalClock.getTime();
  applyImageToShared(infoPath);
  setLabelText(currentLabelText);
  sharedImageStim.setAutoDraw(true);
  labelStim.setAutoDraw(!!currentLabelText);
}

function _beginQuestionPhase() {
  trialPhase = Phase.QUESTION;
  const qKey  = currentQOrder[currentQIdx];
  const qDef  = QUESTION_DEFS[qKey];
  applyImageToShared(`stim/03_question/${qDef.bg}`);
  setLabelText(currentLabelText);
  sharedImageStim.setAutoDraw(true);
  labelStim.setAutoDraw(!!currentLabelText);
  scales[qKey].reset();
  questionStartT = globalClock.getTime();
  trialKb.clearEvents();
}

// ── Per-frame dispatcher ──────────────────────────────────────────────────────

function trialRoutineEachFrame() {
  return async function () {
    if (psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape', false);

    const t = globalClock.getTime();

    if (trialPhase === Phase.PRODUCT) {
      sharedImageStim.draw();
      if ((t - phaseStartT) >= phaseDuration) {
        // log product event
        logEvent(participantID, currentTrialIdx, 'product',
          `${currentTrial.product_ENG}.png`, phaseStartT, t);
        _beginFixPhase(Phase.FIX1);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    if (trialPhase === Phase.FIX1) {
      sharedImageStim.draw();
      if ((t - phaseStartT) >= phaseDuration) {
        logEvent(participantID, currentTrialIdx, 'fixation', 'fixation.png', phaseStartT, t);
        await _beginInfoPhase();
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    if (trialPhase === Phase.INFO) {
      sharedImageStim.draw();
      if (labelStim.opacity > 0) labelStim.draw();
      if ((t - phaseStartT) >= phaseDuration) {
        const suffix = INFO_CODE_MAP[currentInfoType];
        logEvent(participantID, currentTrialIdx, 'info',
          `${currentTrial.product_ENG}_${suffix}.png`, phaseStartT, t);
        _beginFixPhase(Phase.FIX2);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    if (trialPhase === Phase.FIX2) {
      sharedImageStim.draw();
      if ((t - phaseStartT) >= phaseDuration) {
        logEvent(participantID, currentTrialIdx, 'fixation', 'fixation.png', phaseStartT, t);
        _beginQuestionPhase();
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    if (trialPhase === Phase.QUESTION) {
      sharedImageStim.draw();
      if (labelStim.opacity > 0) labelStim.draw();
      const qKey = currentQOrder[currentQIdx];
      scales[qKey].draw();

      const keys = trialKb.getKeys({ keyList: ['left', 'right', 'return'], waitRelease: false });
      for (const kobj of keys) {
        const key = kobj.name || kobj;
        if (scales[qKey].handleKey(key)) {
          // participant confirmed
          const endT = globalClock.getTime();
          const rt   = endT - questionStartT;
          const score = scales[qKey].current + 1;   // 1-based (mirrors Python)
          currentQResults[qKey] = { score, rt };
          logEvent(participantID, currentTrialIdx, 'question', qKey, questionStartT, endT, rt);
          _beginFixPhase(Phase.QFIX);
          break;
        }
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    if (trialPhase === Phase.QFIX) {
      sharedImageStim.draw();
      if ((t - phaseStartT) >= phaseDuration) {
        logEvent(participantID, currentTrialIdx, 'fixation', 'fixation.png', phaseStartT, t);
        currentQIdx++;
        if (currentQIdx < currentQOrder.length) {
          _beginQuestionPhase();
        } else {
          trialPhase = Phase.DONE;
        }
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // Phase.DONE — fall through to End
    return Scheduler.Event.NEXT;
  };
}

function trialRoutineEnd(trialIdx) {
  return async function () {
    sharedImageStim.setAutoDraw(false);
    labelStim.setAutoDraw(false);
    trialKb.stop();

    // mirrors behavioral_opt.py results_rows.append(dict(...))
    const g   = k => currentQResults[k]?.score ?? '';
    const grt = k => currentQResults[k]?.rt    ?? '';

    resultsRows.push({
      TrialNumber            : currentTrialIdx,
      product_ENG            : currentTrial.product_ENG,
      product_KOR            : currentTrial.product_KOR,
      genre                  : currentTrial.genre,
      classification         : currentTrial.classification,
      price_range            : currentTrial.price_range,
      InfoType               : currentInfoType,
      Q_Order                : currentQOrder.join('-'),
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
    flushCSVs(participantID);

    if (psychoJS.experiment._currentLoopIteration !== undefined) {
      psychoJS.experiment.nextEntry();
    }

    return Scheduler.Event.NEXT;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  16. QUIT  (mirrors samplesetup.js quitPsychoJS)
// ─────────────────────────────────────────────────────────────────────────────
async function quitPsychoJS(message, isCompleted) {
  // mirrors behavioral_opt.py finally block: flush on exit regardless
  if (participantID) flushCSVs(participantID);

  if (psychoJS.experiment && psychoJS.experiment.isEntryEmpty()) {
    psychoJS.experiment.nextEntry();
  }
  psychoJS.window.close();
  psychoJS.quit({ message, isCompleted });
  return Scheduler.Event.QUIT;
}

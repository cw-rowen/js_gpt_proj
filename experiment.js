/**
 * experiment.js  —  Endorsement Study (PsychoJS / Pavlovia)
 *
 * Mirrors behavioral_opt.py exactly.
 *
 * Root-cause fix for [Init] Please wait… hang:
 *   1. experimentInit() does ONLY visual component allocation (mirrors
 *      samplesetup.js exactly — no CSV reads, no TrialHandler, no async ops).
 *   2. CSV parsing + all randomization moved to trialsLoopBegin(), where
 *      PsychoJS has already resolved every declared resource.
 *   3. Only 9 static files in RESOURCES (not 320 trial images).
 */

import { core, data, util, visual } from './lib/psychojs-2024.1.4.js';
const { PsychoJS } = core;
const { TrialHandler } = data;
const { Scheduler } = util;

// ─────────────────────────────────────────────────────────────────────────────
//  1. CONFIGURATION  (mirrors behavioral_opt.py CFG)
// ─────────────────────────────────────────────────────────────────────────────
const CFG = {
  product_dur  : 4.0,
  info_dur     : 9.0,
  fix_min      : 0.5,
  fix_max      : 1.5,

  max_run                : 2,
  question_order_max_run : 3,

  font               : 'NanumGothic',
  text_color         : 'white',
  text_height_big    : 0.15,
  text_height_medium : 0.045,
  text_height_small  : 0.05,

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
};

// ─────────────────────────────────────────────────────────────────────────────
//  3. QUESTION DEFINITIONS  (mirrors behavioral_opt.py QUESTION_DEFS)
// ─────────────────────────────────────────────────────────────────────────────
const QUESTION_DEFS = {
  credEX    : { bg: 'credibility_EX.png',      left: '전혀 전문적이지 않다', right: '매우 전문적이다' },
  credCON   : { bg: 'credibility_CON.png',     left: '전혀 반영하지 않는다', right: '매우 반영한다'   },
  credPEER  : { bg: 'credibility_PEER.png',    left: '전혀 가깝지 않다',     right: '매우 가깝다'     },
  credGen   : { bg: 'credibility_general.png', left: '전혀 믿지 않음',       right: '매우 신뢰함'     },
  preference: { bg: 'preference.png',          left: '전혀 선호하지 않음',   right: '매우 선호함'     },
};
const GPT_QUESTIONS   = ['credEX', 'credCON', 'credPEER', 'credGen', 'preference'];
const OTHER_QUESTIONS = ['credGen', 'preference'];

// ─────────────────────────────────────────────────────────────────────────────
//  4. RESOURCES  — only 9 small static files
//     Trial images (320) are NOT listed here; they warm via imgCache below.
//     Listing them was the cause of the Init hang.
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

// ─────────────────────────────────────────────────────────────────────────────
//  4b. BACKGROUND IMAGE CACHE
//      Warms all 320 trial images via native HTMLImageElement (no PsychoJS).
//      Called at the top of trialsLoopBegin so images load while intro plays.
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
      el.src = url;
      imgCache[url] = el;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. HELPERS  (mirrors behavioral_opt.py helper functions)
// ─────────────────────────────────────────────────────────────────────────────

function normStr(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveLabel(infoType, peerName, expertLabel) {
  if (infoType === 'peer')   return peerName    ? `[${peerName}의 추천]`     : null;
  if (infoType === 'expert') return expertLabel || INFO_LABEL_MAP['expert'] || null;
  return INFO_LABEL_MAP[infoType] || null;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isValidRun(seq, maxRun) {
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    run = seq[i] === seq[i - 1] ? run + 1 : 1;
    if (run > maxRun) return false;
  }
  return true;
}

function constrainedShuffle(rows, keyFn, maxRun = 2, maxTries = 20000) {
  rows = rows.slice();
  for (let attempt = 0; attempt < maxTries; attempt++) {
    shuffleArray(rows);
    if (isValidRun(rows.map(keyFn), maxRun)) return rows;
  }
  console.warn('constrainedShuffle: returning best-effort order');
  return rows;
}

function assignInfoTypesBalanced(rows, infoTypes, maxRun = 2, maxTries = 5000) {
  const comboKey = r => `${r.genre}|${r.classification}|${r.price_range}`;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const overall = {}; const perCombo = {};
    infoTypes.forEach(t => { overall[t] = 0; });
    const assigned = []; let ok = true;
    for (let i = 0; i < rows.length; i++) {
      const ck = comboKey(rows[i]);
      if (!perCombo[ck]) { perCombo[ck] = {}; infoTypes.forEach(t => { perCombo[ck][t] = 0; }); }
      let cands = infoTypes.slice();
      if (assigned.length >= maxRun &&
          assigned.slice(-maxRun).every(x => x === assigned[assigned.length - 1]))
        cands = cands.filter(t => t !== assigned[assigned.length - 1]);
      if (!cands.length) { ok = false; break; }
      const scored = cands.map(t => ({ t, s: [perCombo[ck][t], overall[t], Math.random()] }));
      scored.sort((a, b) => { for (let k = 0; k < 3; k++) if (a.s[k] !== b.s[k]) return a.s[k] - b.s[k]; return 0; });
      const chosen = scored[0].t;
      assigned.push(chosen); overall[chosen]++; perCombo[ck][chosen]++;
    }
    if (ok) return assigned;
  }
  throw new Error('assignInfoTypesBalanced: could not satisfy constraints');
}

function isValidPositionRuns(history, candidate, maxRun = 3) {
  for (let pos = 0; pos < candidate.length; pos++) {
    let run = 1;
    for (let h = history.length - 1; h >= 0; h--) {
      if (history[h][pos] === candidate[pos]) run++; else break;
    }
    if (run > maxRun) return false;
  }
  return true;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

function buildBalancedQuestionOrders(allOrders, nTrials, maxRun = 3, maxTries = 5000) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const pool = [];
    while (pool.length < nTrials) { const c = allOrders.slice(); shuffleArray(c); pool.push(...c); }
    pool.length = nTrials;
    const arranged = []; const remaining = pool.slice();
    while (remaining.length > 0) {
      const valid = remaining.filter(o => isValidPositionRuns(arranged, o, maxRun));
      if (!valid.length) break;
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
const resultsRows  = [];
const eventLog     = [];
let   eventCounter = 0;

function logEvent(ID, trialIdx, eventType, stimName, startT, endT, rt = null) {
  eventCounter++;
  const duration = eventType === 'question' ? '' : (startT != null && endT != null ? endT - startT : '');
  const rtVal    = eventType === 'question' ? rt : '';
  eventLog.push({ ID, Trial: trialIdx, EventN: eventCounter,
    EventType: eventType, StimName: stimName,
    StartTime: startT, EndTime: endT, Duration: duration, RT: rtVal });
}

function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const header  = Object.keys(rows[0]).join(',');
  const content = [header, ...rows.map(r =>
    Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  )].join('\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = filename; a.click();
}

function flushCSVs(ID) {
  downloadCSV(`Results_${ID}.csv`, resultsRows);
  downloadCSV(`Timing_${ID}.csv`,  eventLog);
}

// ─────────────────────────────────────────────────────────────────────────────
//  7. PSYCHOJS INIT  (Scheduler boot — mirrors samplesetup.js exactly)
// ─────────────────────────────────────────────────────────────────────────────
const psychoJS = new PsychoJS({ debug: false });

const expName = 'EndorsementStudy';
const expInfo = {
  'Participant ID': '',
  'Peer 1': 'Peer1',
  'Peer 2': 'Peer2',
  'Peer 3': 'Peer3',
  'Peer 4': 'Peer4',
};

psychoJS.openWindow({
  fullscr: true,
  color: new util.Color('black'),
  units: 'norm',
  waitBlanking: true,
  backgroundImage: '',
  backgroundFit: 'none',
});

psychoJS.schedule(psychoJS.gui.DlgFromDict({ dictionary: expInfo, title: expName }));

const flowScheduler         = new Scheduler(psychoJS);
const dialogCancelScheduler = new Scheduler(psychoJS);
psychoJS.scheduleCondition(
  () => psychoJS.gui.dialogComponent.button === 'OK',
  flowScheduler,
  dialogCancelScheduler
);

flowScheduler.add(updateInfo);
flowScheduler.add(experimentInit);
flowScheduler.add(introRoutineBegin());
flowScheduler.add(introRoutineEachFrame());
flowScheduler.add(introRoutineEnd());
flowScheduler.add(openingFixationBegin());
flowScheduler.add(openingFixationEachFrame());
flowScheduler.add(openingFixationEnd());

const trialsLoopScheduler = new Scheduler(psychoJS);
flowScheduler.add(trialsLoopBegin(trialsLoopScheduler));
flowScheduler.add(trialsLoopScheduler);
flowScheduler.add(trialsLoopEnd);
flowScheduler.add(quitPsychoJS, 'Experiment complete', true);

dialogCancelScheduler.add(quitPsychoJS, 'Cancelled', false);

psychoJS.start({ expName, expInfo, resources: RESOURCES });

// ─────────────────────────────────────────────────────────────────────────────
//  8. SHARED STATE  (module-level, populated in the two init functions)
// ─────────────────────────────────────────────────────────────────────────────
let globalClock, routineTimer;

// Reusable visual stims (allocated once in experimentInit)
let sharedImageStim, labelStim, scales;

// Trial data (populated in trialsLoopBegin — after resources are loaded)
let trialRows       = [];
let infoAssignment  = [];
let balancedOrdersGpt, balancedOrdersOther;
let gptCounter   = 0;
let otherCounter = 0;
let expertLabelMap  = {};
let peerNames       = [];
let participantID   = '';

// Per-routine phase state
const Phase = Object.freeze({
  PRODUCT:'PRODUCT', FIX1:'FIX1', INFO:'INFO',
  FIX2:'FIX2', QUESTION:'QUESTION', QFIX:'QFIX', DONE:'DONE',
});
let trialPhase, phaseStartT, phaseDuration;
let currentTrial, currentTrialIdx, currentInfoType, currentLabelText;
let currentQOrder, currentQIdx, currentQResults;
let questionStartT;

// Routine-level flags (intro / fixation)
let routineActive, routineKb;

// ─────────────────────────────────────────────────────────────────────────────
//  9. VISUAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function normSize(url) {
  const el = imgCache[url];
  if (el && el.naturalWidth && el.naturalHeight) {
    const iw = el.naturalWidth, ih = el.naturalHeight;
    const ww = window.innerWidth,  wh = window.innerHeight;
    const sc = Math.min(ww / iw, wh / ih);
    return [(iw * sc / ww) * 2, (ih * sc / wh) * 2];
  }
  return [2, 2];
}

function applyImage(path) {
  sharedImageStim.setImage(path);
  sharedImageStim.setSize(normSize(path));
}

function setLabel(text) {
  if (text) { labelStim.setText(text); labelStim.setOpacity(1); }
  else       { labelStim.setText('');  labelStim.setOpacity(0); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  10. LIKERT SCALE CLASS  (mirrors behavioral_opt.py LikertScale)
// ─────────────────────────────────────────────────────────────────────────────
class LikertScale {
  constructor(win, leftLabel = '', rightLabel = '') {
    const n = CFG.scale_n;
    const xs = Array.from({ length: n }, (_, i) =>
      CFG.scale_x_left + i * (CFG.scale_x_right - CFG.scale_x_left) / (n - 1));
    const r = CFG.circle_radius;

    this.circles = xs.map(x => new visual.Polygon({
      win, edges: 64, radius: r, pos: [x, CFG.scale_y],
      lineColor: new util.Color(CFG.text_color), lineWidth: 4,
      fillColor: null, units: 'height',
    }));
    this.numbers = xs.map((x, i) => new visual.TextStim({
      win, text: String(i + 1), pos: [x, CFG.numbers_y],
      height: CFG.text_height_medium, color: CFG.text_color,
      font: CFG.font, bold: true, alignText: 'center', units: 'height',
    }));
    this.leftDesc = leftLabel ? new visual.TextStim({
      win, text: leftLabel, pos: [CFG.scale_x_left - 2 * r, CFG.desc_y],
      height: CFG.text_height_small, color: CFG.text_color,
      font: CFG.font, bold: true, alignText: 'left', anchorHoriz: 'left', units: 'height',
    }) : null;
    this.rightDesc = rightLabel ? new visual.TextStim({
      win, text: rightLabel, pos: [CFG.scale_x_right + 2 * r, CFG.desc_y],
      height: CFG.text_height_small, color: CFG.text_color,
      font: CFG.font, bold: true, alignText: 'right', anchorHoriz: 'right', units: 'height',
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

  handleKey(key) {
    const mid = Math.floor(CFG.scale_n / 2), n = CFG.scale_n;
    if      (key === 'left')                            this.current = this.current === null ? mid : Math.max(0, this.current - 1);
    else if (key === 'right')                           this.current = this.current === null ? mid : Math.min(n - 1, this.current + 1);
    else if (key === 'return' && this.current !== null) return true;
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  11. updateInfo  (mirrors samplesetup.js — timestamps only)
// ─────────────────────────────────────────────────────────────────────────────
async function updateInfo() {
  expInfo['date']            = util.MonotonicClock.getDateStr();
  expInfo['expName']         = expName;
  expInfo['psychopyVersion'] = '2024.1.4';
  expInfo['OS']              = window.navigator.platform;
  psychoJS.experiment.dataFileName =
    `data/${expInfo['Participant ID']}_${expName}_${expInfo['date']}`;
  psychoJS.experiment.field_separator = '\t';
  return Scheduler.Event.NEXT;
}

// ─────────────────────────────────────────────────────────────────────────────
//  12. experimentInit  — VISUAL ALLOCATION ONLY (mirrors samplesetup.js)
//      No CSV reads, no TrialHandler, no await.  Just stims + clocks.
// ─────────────────────────────────────────────────────────────────────────────
async function experimentInit() {
  globalClock  = new util.Clock();
  routineTimer = new util.CountdownTimer();

  const win = psychoJS.window;

  sharedImageStim = new visual.ImageStim({
    win, name: 'sharedImage',
    pos: [0, 0], size: [2, 2], units: 'norm',
  });

  labelStim = new visual.TextStim({
    win, name: 'labelStim', text: '',
    pos: [CFG.label_x, CFG.label_y],
    height: CFG.text_height_big,
    color: CFG.text_color, font: CFG.font,
    bold: true, alignText: 'left', anchorHoriz: 'left', anchorVert: 'top',
    units: 'norm', opacity: 0,
  });

  scales = {
    credEX    : new LikertScale(win, '전혀 전문적이지 않다', '매우 전문적이다'),
    credCON   : new LikertScale(win, '전혀 반영하지 않는다', '매우 반영한다'),
    credPEER  : new LikertScale(win, '전혀 가깝지 않다',     '매우 가깝다'),
    credGen   : new LikertScale(win, '전혀 믿지 않음',       '매우 신뢰함'),
    preference: new LikertScale(win, '전혀 선호하지 않음',   '매우 선호함'),
  };

  return Scheduler.Event.NEXT;
}

// ─────────────────────────────────────────────────────────────────────────────
//  13. INTRO ROUTINE  (mirrors behavioral_opt.py show_intro)
// ─────────────────────────────────────────────────────────────────────────────
function introRoutineBegin() {
  return async function () {
    routineActive = true;
    applyImage('stim/04_intro/intro.png');
    setLabel(null);
    sharedImageStim.setAutoDraw(true);
    labelStim.setAutoDraw(false);

    routineKb = new core.Keyboard({ psychoJS, clock: new util.Clock(), waitForStart: true });
    routineKb.clock.reset();
    routineKb.start();
    routineKb.clearEvents();

    return Scheduler.Event.NEXT;
  };
}

function introRoutineEachFrame() {
  return async function () {
    if (psychoJS.experiment.experimentEnded ||
        psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape', false);

    const keys = routineKb.getKeys({ keyList: ['space', 'return'], waitRelease: false });
    if (keys.length > 0) routineActive = false;

    if (!routineActive) return Scheduler.Event.NEXT;
    return Scheduler.Event.FLIP_REPEAT;
  };
}

function introRoutineEnd() {
  return async function () {
    sharedImageStim.setAutoDraw(false);
    routineKb.stop();
    return Scheduler.Event.NEXT;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  14. OPENING FIXATION  (mirrors behavioral_opt.py show_fixation(mindur=3,maxdur=3))
// ─────────────────────────────────────────────────────────────────────────────
function openingFixationBegin() {
  return async function () {
    applyImage('stim/00_fixation/fixation.png');
    sharedImageStim.setSize([2, 2]);
    setLabel(null);
    sharedImageStim.setAutoDraw(true);
    labelStim.setAutoDraw(false);
    routineTimer.add(3.0);
    return Scheduler.Event.NEXT;
  };
}

function openingFixationEachFrame() {
  return async function () {
    if (psychoJS.experiment.experimentEnded ||
        psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape', false);
    if (routineTimer.getTime() <= 0) return Scheduler.Event.NEXT;
    return Scheduler.Event.FLIP_REPEAT;
  };
}

function openingFixationEnd() {
  return async function () {
    sharedImageStim.setAutoDraw(false);
    return Scheduler.Event.NEXT;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  15. TRIALS LOOP BEGIN
//
//  CSV parsing and randomization live here — AFTER PsychoJS has confirmed
//  every declared resource is loaded.  Matches samplesetup.js pattern
//  where TrialHandler is constructed inside trialsLoopBegin.
// ─────────────────────────────────────────────────────────────────────────────
function trialsLoopBegin(loopScheduler) {
  return async function () {

    // ── Validate participant fields ────────────────────────────────────────
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

    // ── Warm background image cache ────────────────────────────────────────
    warmImageCache();

    // ── Parse expert_labels.csv ────────────────────────────────────────────
    //   Resource is guaranteed loaded by now.
    //   Format: no header; each line = product_ENG,label
    //   mirrors behavioral_opt.py expert_label_map construction
    try {
      const raw  = psychoJS.serverManager.getResource('expert_labels.csv');
      const text = (typeof raw === 'string') ? raw : new TextDecoder().decode(raw);
      for (const line of text.split(/\r?\n/)) {
        const ci = line.indexOf(',');
        if (ci === -1) continue;
        const product = normStr(line.slice(0, ci));
        const label   = line.slice(ci + 1).trim();
        if (product && label) expertLabelMap[product] = label;
      }
    } catch (e) {
      console.error('expert_labels.csv parse error:', e);
    }

    // ── Parse product_list.csv ─────────────────────────────────────────────
    //   Parsed synchronously from the preloaded resource instead of passing
    //   the filename string to TrialHandler (which would trigger another async
    //   fetch and could hang the Scheduler).
    //   mirrors behavioral_opt.py pd.read_excel → df.to_dict('records')
    let rawRows = [];
    try {
      const raw  = psychoJS.serverManager.getResource('product_list.csv');
      const text = (typeof raw === 'string') ? raw : new TextDecoder().decode(raw);
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        if (vals.length < headers.length) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
        rawRows.push(row);
      }
    } catch (e) {
      console.error('product_list.csv parse error:', e);
    }

    // ── Constrained shuffle  (mirrors behavioral_opt.py constrained_shuffle)
    trialRows = constrainedShuffle(
      rawRows,
      r => `${r.genre}|${r.classification}|${r.price_range}`,
      CFG.max_run,
    );

    const nTrials = trialRows.length;

    // ── Info type assignment
    infoAssignment = assignInfoTypesBalanced(
      trialRows, Object.keys(INFO_CODE_MAP), CFG.max_run,
    );

    // ── Balanced question order pools (mirrors behavioral_opt.py, called twice)
    const ALL_GPT   = permutations(GPT_QUESTIONS);
    const ALL_OTHER = permutations(OTHER_QUESTIONS);
    balancedOrdersGpt   = buildBalancedQuestionOrders(ALL_GPT,   nTrials, CFG.question_order_max_run);
    balancedOrdersOther = buildBalancedQuestionOrders(ALL_OTHER, nTrials, CFG.question_order_max_run);
    gptCounter   = 0;
    otherCounter = 0;

    // ── Schedule one routine per trial ────────────────────────────────────
    for (let i = 0; i < trialRows.length; i++) {
      loopScheduler.add(trialBegin(i));
      loopScheduler.add(trialEachFrame());
      loopScheduler.add(trialEnd(i));
    }
    loopScheduler.add(async () => Scheduler.Event.NEXT);

    return Scheduler.Event.NEXT;
  };
}

async function trialsLoopEnd() {
  return Scheduler.Event.NEXT;
}

// ─────────────────────────────────────────────────────────────────────────────
//  16. TRIAL ROUTINE
//
//  Single routine that sequences all phases of one trial via trialPhase flag:
//    PRODUCT → FIX1 → INFO → FIX2 → QUESTION[0..n] (+QFIX after each) → DONE
//
//  Mirrors behavioral_opt.py trial loop body exactly.
// ─────────────────────────────────────────────────────────────────────────────
let trialKb;

function trialBegin(idx) {
  return async function () {
    currentTrial    = trialRows[idx];
    currentTrialIdx = idx + 1;
    currentInfoType = infoAssignment[idx];

    const peerName = currentInfoType === 'peer'
      ? peerNames[Math.floor(Math.random() * peerNames.length)] : null;
    const expertLabel = currentInfoType === 'expert'
      ? (expertLabelMap[normStr(currentTrial.product_ENG)] || null) : null;
    currentLabelText = resolveLabel(currentInfoType, peerName, expertLabel);

    if (currentInfoType === 'gpt') {
      currentQOrder = balancedOrdersGpt[gptCounter % balancedOrdersGpt.length].slice();
      gptCounter++;
    } else {
      currentQOrder = balancedOrdersOther[otherCounter % balancedOrdersOther.length].slice();
      otherCounter++;
    }
    currentQIdx     = 0;
    currentQResults = {};

    trialKb = new core.Keyboard({ psychoJS, clock: globalClock, waitForStart: true });
    trialKb.start();
    trialKb.clearEvents();

    _startProductPhase();
    return Scheduler.Event.NEXT;
  };
}

// ── Phase starters ────────────────────────────────────────────────────────────

function _startProductPhase() {
  trialPhase    = Phase.PRODUCT;
  phaseDuration = CFG.product_dur;
  phaseStartT   = globalClock.getTime();
  applyImage(`stim/01_product/${currentTrial.product_ENG.trim()}.png`);
  setLabel(null);
  sharedImageStim.setAutoDraw(true);
  labelStim.setAutoDraw(false);
}

function _startFixPhase(nextPhase) {
  trialPhase    = nextPhase;
  phaseDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
  phaseStartT   = globalClock.getTime();
  applyImage('stim/00_fixation/fixation.png');
  sharedImageStim.setSize([2, 2]);
  setLabel(null);
  sharedImageStim.setAutoDraw(true);
  labelStim.setAutoDraw(false);
}

function _startInfoPhase() {
  const suffix  = INFO_CODE_MAP[currentInfoType];
  const path    = `stim/02_information/${currentTrial.product_ENG.trim()}_${suffix}.png`;
  trialPhase    = Phase.INFO;
  phaseDuration = CFG.info_dur;
  phaseStartT   = globalClock.getTime();
  applyImage(path);
  setLabel(currentLabelText);
  sharedImageStim.setAutoDraw(true);
  labelStim.setAutoDraw(!!currentLabelText);
}

function _startQuestionPhase() {
  trialPhase = Phase.QUESTION;
  const qKey  = currentQOrder[currentQIdx];
  const qDef  = QUESTION_DEFS[qKey];
  applyImage(`stim/03_question/${qDef.bg}`);
  setLabel(currentLabelText);
  sharedImageStim.setAutoDraw(true);
  labelStim.setAutoDraw(!!currentLabelText);
  scales[qKey].reset();
  questionStartT = globalClock.getTime();
  trialKb.clearEvents();
}

// ── EachFrame dispatcher ──────────────────────────────────────────────────────

function trialEachFrame() {
  return async function () {
    if (psychoJS.experiment.experimentEnded ||
        psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape', false);

    const t = globalClock.getTime();

    if (trialPhase === Phase.PRODUCT) {
      sharedImageStim.draw();
      if ((t - phaseStartT) >= phaseDuration) {
        logEvent(participantID, currentTrialIdx, 'product',
          `${currentTrial.product_ENG}.png`, phaseStartT, t);
        _startFixPhase(Phase.FIX1);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    if (trialPhase === Phase.FIX1) {
      sharedImageStim.draw();
      if ((t - phaseStartT) >= phaseDuration) {
        logEvent(participantID, currentTrialIdx, 'fixation', 'fixation.png', phaseStartT, t);
        _startInfoPhase();
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
        _startFixPhase(Phase.FIX2);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    if (trialPhase === Phase.FIX2) {
      sharedImageStim.draw();
      if ((t - phaseStartT) >= phaseDuration) {
        logEvent(participantID, currentTrialIdx, 'fixation', 'fixation.png', phaseStartT, t);
        _startQuestionPhase();
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
        const key = typeof kobj === 'string' ? kobj : kobj.name;
        if (scales[qKey].handleKey(key)) {
          const endT  = globalClock.getTime();
          const rt    = endT - questionStartT;
          const score = scales[qKey].current + 1;
          currentQResults[qKey] = { score, rt };
          logEvent(participantID, currentTrialIdx, 'question', qKey, questionStartT, endT, rt);
          _startFixPhase(Phase.QFIX);
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
        if (currentQIdx < currentQOrder.length) _startQuestionPhase();
        else trialPhase = Phase.DONE;
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // Phase.DONE
    return Scheduler.Event.NEXT;
  };
}

function trialEnd(idx) {
  return async function () {
    sharedImageStim.setAutoDraw(false);
    labelStim.setAutoDraw(false);
    trialKb.stop();

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

    flushCSVs(participantID);
    psychoJS.experiment.nextEntry();
    return Scheduler.Event.NEXT;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  17. QUIT  (mirrors samplesetup.js quitPsychoJS)
// ─────────────────────────────────────────────────────────────────────────────
async function quitPsychoJS(message, isCompleted) {
  if (participantID) flushCSVs(participantID);
  if (psychoJS.experiment && psychoJS.experiment.isEntryEmpty())
    psychoJS.experiment.nextEntry();
  psychoJS.window.close();
  psychoJS.quit({ message, isCompleted });
  return Scheduler.Event.QUIT;
}

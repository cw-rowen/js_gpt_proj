/******************************************************************************
 * experiment.js – Endorsement Study (Full Port from behavioral_opt.py)
 ******************************************************************************/

import { core, util, visual } from './lib/psychojs-2026.1.3.js';
const { PsychoJS } = core;
const { Scheduler } = util;


// ─────────────────────────────────────────────
//  1. CONFIGURATION  (mirrors CFG in behavioral_opt.py)
// ─────────────────────────────────────────────

const CFG = {
  // timing
  product_dur:            4.0,
  info_dur:               9.0,
  fix_min:                0.5,
  fix_max:                1.5,

  // debug
  debug:                  false,
  debug_info_type:        'expert',  // 'expert' | 'consensus' | 'peer' | 'gpt'

  // randomisation
  max_run:                2,
  question_order_max_run: 3,

  // window
  bg_color:               'black',

  // text
  font:                   'NanumGothic',
  text_height_big:        0.08,
  text_height_medium:     0.04,
  text_height_small:      0.045,
  text_bold:              true,
  text_color:             'white',

  // Likert scale  (height units)
  scale_n:                7,
  circle_radius:          0.045,
  scale_y:               -0.15,
  numbers_y:             -0.265,
  desc_y:                -0.33,
  scale_x_left:          -0.42,
  scale_x_right:          0.42,
  label_x:               -0.6,
  label_y:                0.42,
};

const INFO_CODE_MAP = {
  expert:    '01',
  consensus: '02',
  peer:      '03',
  gpt:       '04',
};

const INFO_LABEL_MAP = {
  consensus: '[소비자 의견 종합]',
  gpt:       '[ChatGPT]',
};

const QUESTION_DEFS = {
  credEX:     { img: 'stim/03_question/credibility_EX.png',      left: '전혀 전문적이지 않다', right: '매우 전문적이다' },
  credCON:    { img: 'stim/03_question/credibility_CON.png',     left: '전혀 반영하지 않는다', right: '매우 반영한다'  },
  credPEER:   { img: 'stim/03_question/credibility_PEER.png',    left: '전혀 가깝지 않다',     right: '매우 가깝다'    },
  credGen:    { img: 'stim/03_question/credibility_general.png', left: '전혀 믿지 않음',       right: '매우 신뢰함'    },
  preference: { img: 'stim/03_question/preference.png',          left: '전혀 선호하지 않음',   right: '매우 선호함'    },
};

const GPT_QUESTIONS   = ['credEX', 'credCON', 'credPEER', 'credGen', 'preference'];
const OTHER_QUESTIONS = ['credGen', 'preference'];


// ─────────────────────────────────────────────
//  2. RANDOMISATION HELPERS
// ─────────────────────────────────────────────

function isValidRun(seq, maxRun) {
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === seq[i - 1]) { if (++run > maxRun) return false; }
    else run = 1;
  }
  return true;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function constrainedShuffle(rows, keyFn, maxRun = 2, maxTries = 20000) {
  rows = [...rows];
  for (let attempt = 0; attempt < maxTries; attempt++) {
    shuffleInPlace(rows);
    if (isValidRun(rows.map(keyFn), maxRun)) return rows;
  }
  console.warn('constrainedShuffle: could not satisfy run constraint – returning last attempt');
  return rows;
}

function assignInfoTypesBalanced(rows, infoTypes, maxRun = 2, maxTries = 5000) {
  const combo = r => `${r.genre}|${r.classification}|${r.price_range}`;
  const n = rows.length;
  const combos = rows.map(combo);

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const overall  = {};
    const perCombo = {};
    const assigned = [];
    let ok = true;

    for (let i = 0; i < n; i++) {
      const ck = combos[i];
      let candidates = [...infoTypes];

      if (assigned.length >= maxRun &&
          assigned.slice(-maxRun).every(x => x === assigned[assigned.length - 1])) {
        candidates = candidates.filter(t => t !== assigned[assigned.length - 1]);
      }
      if (candidates.length === 0) { ok = false; break; }

      if (!perCombo[ck]) perCombo[ck] = {};
      const scored = candidates.map(t => [perCombo[ck][t] || 0, overall[t] || 0, Math.random(), t]);
      scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      const chosen = scored[0][3];

      assigned.push(chosen);
      overall[chosen]      = (overall[chosen]      || 0) + 1;
      perCombo[ck][chosen] = (perCombo[ck][chosen] || 0) + 1;
    }
    if (ok) return assigned;
  }
  throw new Error('assignInfoTypesBalanced: could not satisfy constraints');
}

function isValidPositionRuns(history, candidate, maxRun = 3) {
  for (let pos = 0; pos < candidate.length; pos++) {
    let run = 1;
    for (let k = history.length - 1; k >= 0; k--) {
      if (history[k][pos] === candidate[pos]) run++; else break;
    }
    if (run > maxRun) return false;
  }
  return true;
}

function buildBalancedQuestionOrders(allOrders, nTrials, maxRun = 3, maxTries = 5000) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    let pool = [];
    while (pool.length < nTrials) {
      const chunk = [...allOrders];
      shuffleInPlace(chunk);
      pool.push(...chunk);
    }
    pool = pool.slice(0, nTrials);

    const arranged = [];
    let remaining  = [...pool];
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

function permutations(arr) {
  if (arr.length <= 1) return [[...arr]];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

function normStr(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveLabel(infoType, peerName, expertLabel) {
  if (infoType === 'peer')   return peerName    ? `[${peerName}의 추천]` : null;
  if (infoType === 'expert') return expertLabel || null;
  return INFO_LABEL_MAP[infoType] || null;
}

function linspace(start, stop, num) {
  if (num === 1) return [start];
  const step = (stop - start) / (num - 1);
  return Array.from({ length: num }, (_, i) => start + i * step);
}


// ─────────────────────────────────────────────
//  3. PSYCHOJS BOOTSTRAP
// ─────────────────────────────────────────────

const psychoJS = new PsychoJS({ debug: CFG.debug });

const expInfo = {
  'Participant ID': '',
  'Peer 1': '',
  'Peer 2': '',
  'Peer 3': '',
  'Peer 4': '',
};

psychoJS.openWindow({
  fullscr:         true,
  color:           new util.Color(CFG.bg_color),
  units:           'height',
  waitBlanking:    true,
  backgroundImage: '',
  backgroundFit:   'none',
});

psychoJS.schedule(psychoJS.gui.DlgFromDict({
  dictionary: expInfo,
  title:      '연구 참여 정보 입력',
}));

const flowScheduler         = new Scheduler(psychoJS);
const dialogCancelScheduler = new Scheduler(psychoJS);

psychoJS.scheduleCondition(
  () => psychoJS.gui.dialogComponent.button === 'OK',
  flowScheduler,
  dialogCancelScheduler,
);

flowScheduler.add(updateInfo);
flowScheduler.add(experimentInit);
flowScheduler.add(introRoutineBegin());
flowScheduler.add(introRoutineEachFrame());
flowScheduler.add(introRoutineEnd());
flowScheduler.add(introFixRoutineBegin());
flowScheduler.add(introFixRoutineEachFrame());
flowScheduler.add(introFixRoutineEnd());
const trialsLoopScheduler = new Scheduler(psychoJS);
flowScheduler.add(trialsLoopBegin(trialsLoopScheduler));
flowScheduler.add(trialsLoopScheduler);
flowScheduler.add(trialsLoopEnd());
flowScheduler.add(quitPsychoJS, '', true);

dialogCancelScheduler.add(quitPsychoJS, '', false);

psychoJS.start({
  expName:  'Endorsement Study',
  expInfo,
  resources: [
    { name: 'product_list.csv',                         path: 'product_list.csv'                         },
    { name: 'expert_labels.csv',                        path: 'expert_labels.csv'                        },
    { name: 'stim/00_fixation/fixation.png',            path: 'stim/00_fixation/fixation.png'            },
    { name: 'stim/04_intro/intro.png',                  path: 'stim/04_intro/intro.png'                  },
    { name: 'stim/03_question/credibility_EX.png',      path: 'stim/03_question/credibility_EX.png'      },
    { name: 'stim/03_question/credibility_CON.png',     path: 'stim/03_question/credibility_CON.png'     },
    { name: 'stim/03_question/credibility_PEER.png',    path: 'stim/03_question/credibility_PEER.png'    },
    { name: 'stim/03_question/credibility_general.png', path: 'stim/03_question/credibility_general.png' },
    { name: 'stim/03_question/preference.png',          path: 'stim/03_question/preference.png'          },
  ],
});

psychoJS.experimentLogger.setLevel(core.Logger.ServerLevel.EXP);


// ─────────────────────────────────────────────
//  4. GLOBAL STATE
// ─────────────────────────────────────────────

let globalClock, routineTimer;
let currentLoop;
let frameDur;

// Stimuli – built once in experimentInit, reused every trial
let introClock, introStim, introKey;
let introFixClock;
let fixStim;
let productStim, infoStim, labelStim;
let questionStim;
let scale_circles   = [];
let scale_numbers   = [];
let scale_leftDesc  = null;
let scale_rightDesc = null;
let scaleKb;

// Computed in experimentInit, consumed by trial loop
let trialRows      = [];
let infoAssignment = [];
let qOrdersGPT     = [];
let qOrdersOther   = [];
let expertMap      = {};
let peerNames      = [];

let gptCounter   = 0;
let otherCounter = 0;
let trialIndex   = 0;


// ─────────────────────────────────────────────
//  5. updateInfo
// ─────────────────────────────────────────────

async function updateInfo() {
  currentLoop = psychoJS.experiment;
  expInfo['date']            = util.MonotonicClock.getDateStr();
  expInfo['expName']         = 'Endorsement Study';
  expInfo['psychopyVersion'] = '2026.1.3';
  expInfo['OS']              = window.navigator.platform;
  expInfo['frameRate']       = psychoJS.window.getActualFrameRate();
  frameDur = (typeof expInfo['frameRate'] !== 'undefined')
    ? 1.0 / Math.round(expInfo['frameRate'])
    : 1.0 / 60.0;
  util.addInfoFromUrl(expInfo);
  psychoJS.experiment.dataFileName =
    `data/${expInfo['Participant ID']}_EndorsementStudy_${expInfo['date']}`;
  psychoJS.experiment.field_separator = '\t';
  return Scheduler.Event.NEXT;
}


// ─────────────────────────────────────────────
//  6. experimentInit
// ─────────────────────────────────────────────

async function experimentInit() {
  const win = psychoJS.window;

  if (CFG.debug) {
    CFG.product_dur = 1.0;
    CFG.info_dur    = 1.0;
    CFG.fix_min     = 0.1;
    CFG.fix_max     = 0.2;
  }

  // ── clocks ──────────────────────────────────
  introClock    = new util.Clock();
  introFixClock = new util.Clock();
  globalClock   = new util.Clock();
  routineTimer  = new util.CountdownTimer();

  // ── dialog values ───────────────────────────
  const ID = String(expInfo['Participant ID']).trim();
  peerNames = [1, 2, 3, 4].map(i => String(expInfo[`Peer ${i}`]).trim());
  if (!ID)                           console.warn('Participant ID is empty.');
  if (peerNames.some(n => n === '')) console.warn('One or more Peer name fields are empty.');

  // ── intro image ─────────────────────────────
  introStim = new visual.ImageStim({
    win, name: 'introStim',
    image: 'stim/04_intro/intro.png',
    pos: [0, 0], units: 'height', anchor: 'center',
  });
  introKey = new core.Keyboard({ psychoJS, clock: new util.Clock(), waitForStart: true });

  // ── fixation (reused across all fixation phases) ──
  fixStim = new visual.ImageStim({
    win, name: 'fixStim',
    image: 'stim/00_fixation/fixation.png',
    pos: [0, 0], size: [0.12, 0.12], units: 'height',
  });

  // ── product image (path swapped per trial) ──
  productStim = new visual.ImageStim({
    win, name: 'productStim',
    image: 'stim/00_fixation/fixation.png',
    pos: [0, 0.05], units: 'height', anchor: 'center',
  });

  // ── info image (path swapped per trial) ──
  infoStim = new visual.ImageStim({
    win, name: 'infoStim',
    image: 'stim/00_fixation/fixation.png',
    pos: [0, 0.05], units: 'height', anchor: 'center',
  });

  // ── endorser label (text swapped per trial) ──
  labelStim = new visual.TextStim({
    win, name: 'labelStim',
    text: '',
    pos:         [CFG.label_x, CFG.label_y],
    height:      CFG.text_height_big,
    color:       new util.Color(CFG.text_color),
    font:        CFG.font,
    bold:        CFG.text_bold,
    alignText:   'left',
    anchorHoriz: 'left',
    anchorVert:  'top',
    units:       'height',
    wrapWidth:   0.9,
  });

  // ── question image (path swapped per question) ──
  questionStim = new visual.ImageStim({
    win, name: 'questionStim',
    image: 'stim/03_question/credibility_general.png',
    pos: [0, 0.1], units: 'height', anchor: 'center',
  });

  // ── Likert scale circles + numbers ──────────
  const xs        = linspace(CFG.scale_x_left, CFG.scale_x_right, CFG.scale_n);
  const colWhite  = new util.Color(CFG.text_color);
  const colRed    = new util.Color('red');
  const colClear  = new util.Color([0, 0, 0, 0]); // transparent fill

  for (let i = 0; i < CFG.scale_n; i++) {
    scale_circles.push(new visual.Polygon({
      win,
      edges:     64,
      radius:    CFG.circle_radius,
      lineColor: colWhite,
      lineWidth: 4,
      fillColor: colClear,
      pos:       [xs[i], CFG.scale_y],
      units:     'height',
    }));
    scale_numbers.push(new visual.TextStim({
      win,
      text:      String(i + 1),
      pos:       [xs[i], CFG.numbers_y],
      height:    CFG.text_height_medium,
      color:     colWhite,
      font:      CFG.font,
      bold:      CFG.text_bold,
      alignText: 'center',
      units:     'height',
    }));
  }

  // ── Likert endpoint labels (text swapped per question) ──
  scale_leftDesc = new visual.TextStim({
    win,
    text:        '',
    pos:         [CFG.scale_x_left  - 2 * CFG.circle_radius, CFG.desc_y],
    height:      CFG.text_height_small,
    color:       colWhite,
    font:        CFG.font,
    bold:        CFG.text_bold,
    alignText:   'left',
    anchorHoriz: 'left',
    units:       'height',
    wrapWidth:   0.4,
  });
  scale_rightDesc = new visual.TextStim({
    win,
    text:        '',
    pos:         [CFG.scale_x_right + 2 * CFG.circle_radius, CFG.desc_y],
    height:      CFG.text_height_small,
    color:       colWhite,
    font:        CFG.font,
    bold:        CFG.text_bold,
    alignText:   'right',
    anchorHoriz: 'right',
    units:       'height',
    wrapWidth:   0.4,
  });

  // ── keyboard for scale (arrow keys + return) ──
  scaleKb = new core.Keyboard({ psychoJS, clock: new util.Clock(), waitForStart: true });

  // ── load CSVs ────────────────────────────────
  // In PsychoJS 2026, serverManager.getResource() for a registered CSV
  // returns an already-parsed array of row objects (one object per row,
  // keyed by the header names). No manual parsing needed.
  const expertRows  = psychoJS.serverManager.getResource('expert_labels.csv');
  expertRows.forEach(row => {
    expertMap[normStr(row.product_ENG)] = String(row.expert_label).trim();
  });

  const productRows = psychoJS.serverManager.getResource('product_list.csv');

  const reqCols    = ['product_ENG', 'product_KOR', 'genre', 'classification', 'price_range'];
  const missingCols = reqCols.filter(c => !(c in productRows[0]));
  if (missingCols.length > 0) throw new Error(`product_list.csv missing columns: ${missingCols}`);

  const missingExperts = productRows
    .filter(r => !(normStr(r.product_ENG) in expertMap))
    .map(r => r.product_ENG);
  if (missingExperts.length > 0) console.warn('No expert label for:', missingExperts);

  // ── constrained shuffle of trials ───────────
  trialRows = constrainedShuffle(
    productRows,
    r => `${r.genre}|${r.classification}|${r.price_range}`,
    CFG.max_run,
  );

  const nTrials = trialRows.length;

  // ── info type assignment ─────────────────────
  const infoTypes = Object.keys(INFO_CODE_MAP);
  infoAssignment = CFG.debug
    ? Array(nTrials).fill(CFG.debug_info_type)
    : assignInfoTypesBalanced(trialRows, infoTypes, CFG.max_run);

  // ── question order pools ─────────────────────
  qOrdersGPT   = buildBalancedQuestionOrders(permutations(GPT_QUESTIONS),   nTrials, CFG.question_order_max_run);
  qOrdersOther = buildBalancedQuestionOrders(permutations(OTHER_QUESTIONS), nTrials, CFG.question_order_max_run);

  gptCounter   = 0;
  otherCounter = 0;
  trialIndex   = 0;

  return Scheduler.Event.NEXT;
}


// ─────────────────────────────────────────────
//  7. INTRO ROUTINE  (show intro.png, advance on SPACE / RETURN)
// ─────────────────────────────────────────────

let introComponents;

function introRoutineBegin() {
  return async function () {
    t = 0;
    introClock.reset();
    continueRoutine    = true;
    introKey.keys      = undefined;
    introKey.rt        = undefined;
    introKey._allKeys  = [];
    introComponents    = [introStim, introKey];
    for (const c of introComponents) if ('status' in c) c.status = PsychoJS.Status.NOT_STARTED;
    psychoJS.experiment.addData('intro.started', globalClock.getTime());
    return Scheduler.Event.NEXT;
  };
}

function introRoutineEachFrame() {
  return async function () {
    t = introClock.getTime();

    // introStim: start drawing on first frame
    if (t >= 0 && introStim.status === PsychoJS.Status.NOT_STARTED) {
      introStim.tStart = t;
      introStim.status = PsychoJS.Status.STARTED;
      introStim.setAutoDraw(true);
    }

    // introKey: start listening on first frame
    if (t >= 0 && introKey.status === PsychoJS.Status.NOT_STARTED) {
      introKey.tStart = t;
      introKey.status = PsychoJS.Status.STARTED;
      psychoJS.window.callOnFlip(() => { introKey.clock.reset(); });
      psychoJS.window.callOnFlip(() => { introKey.start(); });
      psychoJS.window.callOnFlip(() => { introKey.clearEvents(); });
    }

    if (introKey.status === PsychoJS.Status.STARTED) {
      const theseKeys = introKey.getKeys({ keyList: ['space', 'return', 'escape'], waitRelease: false });
      introKey._allKeys = introKey._allKeys.concat(theseKeys);
      if (introKey._allKeys.length > 0) {
        introKey.keys = introKey._allKeys[introKey._allKeys.length - 1].name;
        introKey.rt   = introKey._allKeys[introKey._allKeys.length - 1].rt;
        if (introKey.keys === 'escape') return quitPsychoJS('Escape pressed', false);
        continueRoutine = false;
      }
    }

    if (psychoJS.experiment.experimentEnded ||
        psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape pressed', false);

    if (!continueRoutine) return Scheduler.Event.NEXT;
    return Scheduler.Event.FLIP_REPEAT;
  };
}

function introRoutineEnd() {
  return async function () {
    for (const c of introComponents)
      if (typeof c.setAutoDraw === 'function') c.setAutoDraw(false);
    introKey.stop();
    psychoJS.experiment.addData('intro.stopped', globalClock.getTime());
    routineTimer.reset();
    return Scheduler.Event.NEXT;
  };
}


// ─────────────────────────────────────────────
//  8. INITIAL 3-SECOND FIXATION
// ─────────────────────────────────────────────

let introFixComponents;
const INTRO_FIX_DUR = 3.0;

function introFixRoutineBegin() {
  return async function () {
    t = 0;
    introFixClock.reset();
    continueRoutine = true;
    routineTimer.reset();
    routineTimer.add(INTRO_FIX_DUR);
    introFixComponents = [fixStim];
    for (const c of introFixComponents) if ('status' in c) c.status = PsychoJS.Status.NOT_STARTED;
    return Scheduler.Event.NEXT;
  };
}

function introFixRoutineEachFrame() {
  return async function () {
    t = introFixClock.getTime();

    if (t >= 0 && fixStim.status === PsychoJS.Status.NOT_STARTED) {
      fixStim.tStart = t;
      fixStim.status = PsychoJS.Status.STARTED;
      fixStim.setAutoDraw(true);
    }

    if (psychoJS.experiment.experimentEnded ||
        psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape pressed', false);

    continueRoutine = false;
    for (const c of introFixComponents)
      if ('status' in c && c.status !== PsychoJS.Status.FINISHED) { continueRoutine = true; break; }

    if (continueRoutine && routineTimer.getTime() > 0) return Scheduler.Event.FLIP_REPEAT;
    return Scheduler.Event.NEXT;
  };
}

function introFixRoutineEnd() {
  return async function () {
    for (const c of introFixComponents)
      if (typeof c.setAutoDraw === 'function') c.setAutoDraw(false);
    routineTimer.reset();
    return Scheduler.Event.NEXT;
  };
}


// ─────────────────────────────────────────────
//  9. TRIAL LOOP
// ─────────────────────────────────────────────

function trialsLoopBegin(loopScheduler) {
  return async function () {
    // trialRows is populated by experimentInit, which runs before this
    for (let i = 0; i < trialRows.length; i++) {
      loopScheduler.add(trialRoutineBegin(i));
      loopScheduler.add(trialRoutineEachFrame(i));
      loopScheduler.add(trialRoutineEnd(i));
    }
    return Scheduler.Event.NEXT;
  };
}

function trialsLoopEnd() {
  return async function () {
    return Scheduler.Event.NEXT;
  };
}


// ─────────────────────────────────────────────
//  10. PER-TRIAL ROUTINE
//      Phases: fix0 → product → fix1 → info → fix2
//              → [question_init → question → interQ_fix] × N questions
// ─────────────────────────────────────────────

// Shared state across Begin / EachFrame / End for one trial
let _trialPhase;
let _phaseStartT;
let _phaseDuration;
let _trialClock;
let _currentTrial;
let _currentInfoType;
let _currentLabelText;
let _currentQOrder;
let _qIdx;
let _qSelectedCircle;   // 0-based; null = nothing selected yet
let _qResponseGiven;
let _qStartT;
let _interQFixDuration;
let _trialResults;      // { credEX:{score,rt}, ... }

// Pre-build Color objects once to avoid per-frame allocation
const _colRed   = new util.Color('red');
const _colClear = new util.Color([0, 0, 0, 0]);

// Module-level frame variables (mirrors samplesetup.js pattern)
var t;
var continueRoutine;


function trialRoutineBegin(tIdx) {
  return async function () {
    trialIndex       = tIdx + 1;
    _currentTrial    = trialRows[tIdx];
    _currentInfoType = infoAssignment[tIdx];
    _trialClock      = new util.Clock();
    _trialResults    = {};

    // Endorser label
    const peerName    = (_currentInfoType === 'peer')
      ? peerNames[Math.floor(Math.random() * peerNames.length)]
      : null;
    const expertLabel = (_currentInfoType === 'expert')
      ? (expertMap[normStr(_currentTrial.product_ENG)] || null)
      : null;
    _currentLabelText = resolveLabel(_currentInfoType, peerName, expertLabel);

    // Question order
    if (_currentInfoType === 'gpt') {
      _currentQOrder = [...qOrdersGPT[gptCounter % qOrdersGPT.length]];
      gptCounter++;
    } else {
      _currentQOrder = [...qOrdersOther[otherCounter % qOrdersOther.length]];
      otherCounter++;
    }
    _qIdx = 0;

    // Preload images into stims
    productStim.setImage(`stim/01_product/${_currentTrial.product_ENG}.png`);
    infoStim.setImage(
      `stim/02_information/${_currentTrial.product_ENG}_${INFO_CODE_MAP[_currentInfoType]}.png`
    );

    // Log trial metadata
    psychoJS.experiment.addData('TrialNumber',    trialIndex);
    psychoJS.experiment.addData('product_ENG',    _currentTrial.product_ENG);
    psychoJS.experiment.addData('product_KOR',    _currentTrial.product_KOR);
    psychoJS.experiment.addData('genre',          _currentTrial.genre);
    psychoJS.experiment.addData('classification', _currentTrial.classification);
    psychoJS.experiment.addData('price_range',    _currentTrial.price_range);
    psychoJS.experiment.addData('InfoType',       _currentInfoType);
    psychoJS.experiment.addData('Q_Order',        _currentQOrder.join('-'));
    psychoJS.experiment.addData('LabelText',      _currentLabelText || '');

    // Hide everything; state machine will show each stim in turn
    fixStim.setAutoDraw(false);
    productStim.setAutoDraw(false);
    infoStim.setAutoDraw(false);
    labelStim.setAutoDraw(false);
    questionStim.setAutoDraw(false);
    scale_circles.forEach(c => c.setAutoDraw(false));
    scale_numbers.forEach(n => n.setAutoDraw(false));
    scale_leftDesc.setAutoDraw(false);
    scale_rightDesc.setAutoDraw(false);

    // Start with jittered fixation
    _phaseDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
    _phaseStartT   = 0;  // relative to _trialClock (reset just above)
    _trialPhase    = 'fix0';

    return Scheduler.Event.NEXT;
  };
}


function trialRoutineEachFrame(tIdx) {
  return async function () {
    t = _trialClock.getTime();

    if (psychoJS.experiment.experimentEnded ||
        psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape pressed', false);

    // ══════════════════════════════════════════
    //  STATE MACHINE
    // ══════════════════════════════════════════

    // ── fix0: initial jittered fixation ─────────────────────────────────────
    if (_trialPhase === 'fix0') {
      if (!fixStim.autoDraw) fixStim.setAutoDraw(true);

      if (t >= _phaseStartT + _phaseDuration) {
        fixStim.setAutoDraw(false);
        psychoJS.experiment.addData('fix0.started', _phaseStartT);
        psychoJS.experiment.addData('fix0.stopped', t);

        _phaseStartT   = t;
        _phaseDuration = CFG.product_dur;
        _trialPhase    = 'product';
        productStim.setAutoDraw(true);
        psychoJS.experiment.addData('product.started', _phaseStartT);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── product ──────────────────────────────────────────────────────────────
    if (_trialPhase === 'product') {
      if (t >= _phaseStartT + _phaseDuration) {
        productStim.setAutoDraw(false);
        psychoJS.experiment.addData('product.stopped', t);

        _phaseDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
        _phaseStartT   = t;
        _trialPhase    = 'fix1';
        fixStim.setAutoDraw(true);
        psychoJS.experiment.addData('fix1.started', _phaseStartT);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── fix1: fixation between product and info ───────────────────────────────
    if (_trialPhase === 'fix1') {
      if (t >= _phaseStartT + _phaseDuration) {
        fixStim.setAutoDraw(false);
        psychoJS.experiment.addData('fix1.stopped', t);

        _phaseStartT   = t;
        _phaseDuration = CFG.info_dur;
        _trialPhase    = 'info';
        if (_currentLabelText) {
          labelStim.setText(_currentLabelText);
          labelStim.setAutoDraw(true);
        }
        infoStim.setAutoDraw(true);
        psychoJS.experiment.addData('info.started', _phaseStartT);
        psychoJS.experiment.addData('info.fname',
          `stim/02_information/${_currentTrial.product_ENG}_${INFO_CODE_MAP[_currentInfoType]}.png`);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── info ─────────────────────────────────────────────────────────────────
    if (_trialPhase === 'info') {
      if (t >= _phaseStartT + _phaseDuration) {
        infoStim.setAutoDraw(false);
        labelStim.setAutoDraw(false);
        psychoJS.experiment.addData('info.stopped', t);

        _phaseDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
        _phaseStartT   = t;
        _trialPhase    = 'fix2';
        fixStim.setAutoDraw(true);
        psychoJS.experiment.addData('fix2.started', _phaseStartT);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── fix2: fixation before question block ─────────────────────────────────
    if (_trialPhase === 'fix2') {
      if (t >= _phaseStartT + _phaseDuration) {
        fixStim.setAutoDraw(false);
        psychoJS.experiment.addData('fix2.stopped', t);
        _trialPhase = 'question_init';
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── question_init: set up the next question ───────────────────────────────
    if (_trialPhase === 'question_init') {
      if (_qIdx >= _currentQOrder.length) {
        _trialPhase = 'done';
        return Scheduler.Event.NEXT;
      }

      const qKey = _currentQOrder[_qIdx];
      const qDef = QUESTION_DEFS[qKey];

      questionStim.setImage(qDef.img);
      scale_leftDesc.setText(qDef.left);
      scale_rightDesc.setText(qDef.right);

      if (_currentLabelText) {
        labelStim.setText(_currentLabelText);
        labelStim.setAutoDraw(true);
      }

      // Reset circles to unfilled
      scale_circles.forEach(c => c.setFillColor(_colClear));

      // Show scale
      questionStim.setAutoDraw(true);
      scale_circles.forEach(c => c.setAutoDraw(true));
      scale_numbers.forEach(n => n.setAutoDraw(true));
      scale_leftDesc.setAutoDraw(true);
      scale_rightDesc.setAutoDraw(true);

      // Reset response state
      _qSelectedCircle = null;
      _qResponseGiven  = false;

      // Start keyboard fresh for this question
      scaleKb.keys     = undefined;
      scaleKb.rt       = undefined;
      scaleKb._allKeys = [];
      psychoJS.window.callOnFlip(() => { scaleKb.clock.reset(); });
      psychoJS.window.callOnFlip(() => { scaleKb.start(); });
      psychoJS.window.callOnFlip(() => { scaleKb.clearEvents(); });

      _qStartT    = t;
      _trialPhase = 'question';
      psychoJS.experiment.addData(`${qKey}.started`, _qStartT);
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── question: wait for arrow navigation + RETURN confirmation ────────────
    if (_trialPhase === 'question') {
      const qKey    = _currentQOrder[_qIdx];
      const n       = CFG.scale_n;
      const theseKeys = scaleKb.getKeys({ keyList: ['left', 'right', 'return', 'escape'], waitRelease: false });

      for (const k of theseKeys) {
        if (k.name === 'escape') return quitPsychoJS('Escape pressed', false);

        if (k.name === 'left') {
          _qSelectedCircle = (_qSelectedCircle === null)
            ? Math.floor(n / 2)
            : Math.max(0, _qSelectedCircle - 1);
        } else if (k.name === 'right') {
          _qSelectedCircle = (_qSelectedCircle === null)
            ? Math.floor(n / 2)
            : Math.min(n - 1, _qSelectedCircle + 1);
        } else if (k.name === 'return' && _qSelectedCircle !== null) {
          const score = _qSelectedCircle + 1;
          const rt    = k.rt;
          _trialResults[qKey] = { score, rt };
          psychoJS.experiment.addData(`${qKey}_val`,     score);
          psychoJS.experiment.addData(`${qKey}_RT`,      rt);
          psychoJS.experiment.addData(`${qKey}.stopped`, t);
          _qResponseGiven = true;
        }
      }

      // Update circle fill: selected = red, others = transparent
      scale_circles.forEach((c, i) =>
        c.setFillColor(i === _qSelectedCircle ? _colRed : _colClear)
      );

      if (_qResponseGiven) {
        // Hide scale
        questionStim.setAutoDraw(false);
        labelStim.setAutoDraw(false);
        scale_circles.forEach(c => c.setAutoDraw(false));
        scale_numbers.forEach(n => n.setAutoDraw(false));
        scale_leftDesc.setAutoDraw(false);
        scale_rightDesc.setAutoDraw(false);
        scaleKb.stop();

        _qIdx++;
        // Inter-question jittered fixation
        _interQFixDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
        _phaseStartT       = t;
        _trialPhase        = 'interQ_fix';
        fixStim.setAutoDraw(true);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── interQ_fix: fixation between questions ───────────────────────────────
    if (_trialPhase === 'interQ_fix') {
      if (t >= _phaseStartT + _interQFixDuration) {
        fixStim.setAutoDraw(false);
        _trialPhase = 'question_init';
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── done ─────────────────────────────────────────────────────────────────
    return Scheduler.Event.NEXT;
  };
}


function trialRoutineEnd(tIdx) {
  return async function () {
    // Ensure all stims are hidden
    fixStim.setAutoDraw(false);
    productStim.setAutoDraw(false);
    infoStim.setAutoDraw(false);
    labelStim.setAutoDraw(false);
    questionStim.setAutoDraw(false);
    scale_circles.forEach(c => c.setAutoDraw(false));
    scale_numbers.forEach(n => n.setAutoDraw(false));
    scale_leftDesc.setAutoDraw(false);
    scale_rightDesc.setAutoDraw(false);

    // Write empty strings for any unanswered questions (shouldn't happen in normal flow)
    ['credEX', 'credCON', 'credPEER', 'credGen', 'preference'].forEach(q => {
      if (!_trialResults[q]) {
        psychoJS.experiment.addData(`${q}_val`, '');
        psychoJS.experiment.addData(`${q}_RT`,  '');
      }
    });

    psychoJS.experiment.nextEntry();
    return Scheduler.Event.NEXT;
  };
}


// ─────────────────────────────────────────────
//  11. QUIT
// ─────────────────────────────────────────────

async function quitPsychoJS(message, isCompleted) {
  if (psychoJS.experiment.isEntryEmpty()) psychoJS.experiment.nextEntry();
  psychoJS.window.close();
  psychoJS.quit({ message, isCompleted });
  return Scheduler.Event.QUIT;
}

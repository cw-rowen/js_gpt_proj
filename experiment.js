/******************************************************************************
 * experiment.js – Endorsement Study (Full Port from behavioral_opt.py)
 ******************************************************************************/

import { core, data, util, visual } from './lib/psychojs-2026.1.3.js';
const { PsychoJS } = core;
const { TrialHandler } = data;
const { Scheduler } = util;


// ─────────────────────────────────────────────
//  1. CONFIGURATION  (mirrors CFG in behavioral_opt.py)
// ─────────────────────────────────────────────

const CFG = {
  // timing
  product_dur:           4.0,
  info_dur:              9.0,
  fix_min:               0.5,
  fix_max:               1.5,

  // debug
  debug:                 false,
  debug_info_type:       'expert',   // 'expert' | 'consensus' | 'peer' | 'gpt'

  // randomisation
  max_run:               2,
  question_order_max_run: 3,

  // window / units  (PsychoJS uses 'height' units natively; we keep height here)
  bg_color:              'black',

  // text
  font:                  'NanumGothic',
  text_height_big:       0.08,    // endorser label  (norm → height conversion)
  text_height_medium:    0.04,    // Likert numbers
  text_height_small:     0.045,   // Likert endpoint descriptions
  text_bold:             true,
  text_color:            'white',

  // Likert scale  (all in 'height' units)
  scale_n:               7,
  circle_radius:         0.045,
  scale_y:              -0.15,
  numbers_y:            -0.265,
  desc_y:               -0.33,
  scale_x_left:         -0.42,
  scale_x_right:         0.42,
  label_x:              -0.6,
  label_y:               0.42,
};

// Mirrors INFO_CODE_MAP
const INFO_CODE_MAP = {
  expert:    '01',
  consensus: '02',
  peer:      '03',
  gpt:       '04',
};

// Mirrors INFO_LABEL_MAP  (expert & peer resolved dynamically)
const INFO_LABEL_MAP = {
  consensus: '[소비자 의견 종합]',
  gpt:       '[ChatGPT]',
};

// Question definitions  (mirrors QUESTION_DEFS)
const QUESTION_DEFS = {
  credEX:     { img: 'stim/03_question/credibility_EX.png',      left: '전혀 전문적이지 않다', right: '매우 전문적이다' },
  credCON:    { img: 'stim/03_question/credibility_CON.png',     left: '전혀 반영하지 않는다', right: '매우 반영한다'  },
  credPEER:   { img: 'stim/03_question/credibility_PEER.png',    left: '전혀 가깝지 않다',     right: '매우 가깝다'    },
  credGen:    { img: 'stim/03_question/credibility_general.png', left: '전혀 믿지 않음',       right: '매우 신뢰함'    },
  preference: { img: 'stim/03_question/preference.png',          left: '전혀 선호하지 않음',   right: '매우 선호함'    },
};

// GPT trials get all 5 questions; all others get 2
const GPT_QUESTIONS   = ['credEX', 'credCON', 'credPEER', 'credGen', 'preference'];
const OTHER_QUESTIONS = ['credGen', 'preference'];


// ─────────────────────────────────────────────
//  2. RANDOMISATION HELPERS
//     (JS ports of the Python helpers in behavioral_opt.py)
// ─────────────────────────────────────────────

// is_valid_run
function isValidRun(seq, maxRun) {
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === seq[i - 1]) {
      run++;
      if (run > maxRun) return false;
    } else {
      run = 1;
    }
  }
  return true;
}

// constrained_shuffle  – shuffle rows so no max_run consecutive identical keys
function constrainedShuffle(rows, keyFn, maxRun = 2, maxTries = 20000) {
  rows = [...rows];
  for (let attempt = 0; attempt < maxTries; attempt++) {
    shuffleInPlace(rows);
    if (isValidRun(rows.map(keyFn), maxRun)) return rows;
  }
  console.warn('constrainedShuffle: giving up after', maxTries, 'attempts – returning best effort');
  return rows;
}

// assign_info_types_balanced
function assignInfoTypesBalanced(rows, infoTypes, maxRun = 2, maxTries = 5000) {
  const combo = r => `${r.genre}|${r.classification}|${r.price_range}`;
  const n = rows.length;
  const combos = rows.map(combo);

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const overall   = {};
    const perCombo  = {};
    const assigned  = [];
    let ok = true;

    for (let i = 0; i < n; i++) {
      const ck = combos[i];
      let candidates = [...infoTypes];

      // run-length constraint
      if (assigned.length >= maxRun &&
          assigned.slice(-maxRun).every(x => x === assigned[assigned.length - 1])) {
        candidates = candidates.filter(t => t !== assigned[assigned.length - 1]);
      }
      if (candidates.length === 0) { ok = false; break; }

      // score: prefer smallest per-combo count, then smallest overall count, then random
      if (!perCombo[ck]) perCombo[ck] = {};
      const scored = candidates.map(t => [
        perCombo[ck][t] || 0,
        overall[t]      || 0,
        Math.random(),
        t,
      ]);
      scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      const chosen = scored[0][3];

      assigned.push(chosen);
      overall[chosen]        = (overall[chosen]   || 0) + 1;
      perCombo[ck][chosen]   = (perCombo[ck][chosen] || 0) + 1;
    }

    if (ok) return assigned;
  }
  throw new Error('assignInfoTypesBalanced: could not satisfy constraints');
}

// is_valid_position_runs
function isValidPositionRuns(history, candidate, maxRun = 3) {
  for (let pos = 0; pos < candidate.length; pos++) {
    let run = 1;
    for (let k = history.length - 1; k >= 0; k--) {
      if (history[k][pos] === candidate[pos]) run++;
      else break;
    }
    if (run > maxRun) return false;
  }
  return true;
}

// build_balanced_question_orders
function buildBalancedQuestionOrders(allOrders, nTrials, maxRun = 3, maxTries = 5000) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    // fill a pool of at least nTrials by cycling shuffled copies
    let pool = [];
    while (pool.length < nTrials) {
      const chunk = [...allOrders];
      shuffleInPlace(chunk);
      pool.push(...chunk);
    }
    pool = pool.slice(0, nTrials);

    const arranged  = [];
    let remaining = [...pool];

    while (remaining.length > 0) {
      const valid = remaining.filter(o => isValidPositionRuns(arranged, o, maxRun));
      if (valid.length === 0) break;
      const chosen = valid[Math.floor(Math.random() * valid.length)];
      arranged.push(chosen);
      const idx = remaining.indexOf(chosen);
      remaining.splice(idx, 1);
    }

    if (arranged.length === nTrials) return arranged;
  }
  throw new Error('buildBalancedQuestionOrders: could not satisfy position-run constraint');
}

// permutations helper
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

// Fisher-Yates in-place shuffle
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// normalise string (mirrors norm() in behavioral_opt.py)
function normStr(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

// resolve the endorser label text  (mirrors resolve_label())
function resolveLabel(infoType, peerName, expertLabel) {
  if (infoType === 'peer')   return peerName   ? `[${peerName}의 추천]` : null;
  if (infoType === 'expert') return expertLabel || null;
  return INFO_LABEL_MAP[infoType] || null;
}


// ─────────────────────────────────────────────
//  3. PSYCHOJS BOOTSTRAP
// ─────────────────────────────────────────────

const psychoJS = new PsychoJS({ debug: CFG.debug });

// --- Startup dialog  (mirrors the DlgFromDict in main())
const expInfo = {
  'Participant ID': '',
  'Peer 1': '',
  'Peer 2': '',
  'Peer 3': '',
  'Peer 4': '',
};

// Open window before dialog
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

const flowScheduler        = new Scheduler(psychoJS);
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

// Build resource list dynamically from product_list.csv columns
// All stimulus files that must be pre-loaded are declared here.
// Product images and info images are registered after product_list.csv is parsed,
// but we pre-load everything we can name statically.
psychoJS.start({
  expName:  'Endorsement Study',
  expInfo,
  resources: [
    { name: 'product_list.csv',                              path: 'product_list.csv'                              },
    { name: 'expert_labels.csv',                             path: 'expert_labels.csv'                             },
    { name: 'stim/00_fixation/fixation.png',                 path: 'stim/00_fixation/fixation.png'                 },
    { name: 'stim/04_intro/intro.png',                       path: 'stim/04_intro/intro.png'                       },
    { name: 'stim/03_question/credibility_EX.png',           path: 'stim/03_question/credibility_EX.png'           },
    { name: 'stim/03_question/credibility_CON.png',          path: 'stim/03_question/credibility_CON.png'          },
    { name: 'stim/03_question/credibility_PEER.png',         path: 'stim/03_question/credibility_PEER.png'         },
    { name: 'stim/03_question/credibility_general.png',      path: 'stim/03_question/credibility_general.png'      },
    { name: 'stim/03_question/preference.png',               path: 'stim/03_question/preference.png'               },
  ],
});

psychoJS.experimentLogger.setLevel(core.Logger.ServerLevel.EXP);


// ─────────────────────────────────────────────
//  4. GLOBAL STATE
// ─────────────────────────────────────────────

let globalClock, routineTimer;
let currentLoop;
let frameDur;

// Stimuli (built once in experimentInit, reused every trial)
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

// Data computed in experimentInit, consumed by the trial loop
let trialRows        = [];       // shuffled product rows
let infoAssignment   = [];       // per-trial info type strings
let qOrdersGPT       = [];       // per-trial question orderings (GPT)
let qOrdersOther     = [];       // per-trial question orderings (other)
let expertMap        = {};       // product_ENG → expert label string
let peerNames        = [];       // 4 peer names from dialog

// Per-trial counters (reset in experimentInit)
let gptCounter   = 0;
let otherCounter = 0;
let trialIndex   = 0;            // 1-based, for data logging


// ─────────────────────────────────────────────
//  5. updateInfo  (mirrors the PsychoJS boilerplate)
// ─────────────────────────────────────────────

async function updateInfo() {
  currentLoop = psychoJS.experiment;
  expInfo['date']           = util.MonotonicClock.getDateStr();
  expInfo['expName']        = 'Endorsement Study';
  expInfo['psychopyVersion'] = '2026.1.3';
  expInfo['OS']             = window.navigator.platform;
  expInfo['frameRate']      = psychoJS.window.getActualFrameRate();
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
//     Builds all stimuli, loads CSVs, computes trial / question order
// ─────────────────────────────────────────────

async function experimentInit() {
  const win = psychoJS.window;

  // Resolve timing (debug overrides mirror behavioral_opt.py)
  if (CFG.debug) {
    CFG.product_dur = 1.0;
    CFG.info_dur    = 1.0;
    CFG.fix_min     = 0.1;
    CFG.fix_max     = 0.2;
  }

  // ── clocks ─────────────────────────────────
  introClock   = new util.Clock();
  introFixClock = new util.Clock();
  globalClock  = new util.Clock();
  routineTimer = new util.CountdownTimer();

  // ── validate dialog fields ──────────────────
  const ID = String(expInfo['Participant ID']).trim();
  peerNames = [1, 2, 3, 4].map(i => String(expInfo[`Peer ${i}`]).trim());
  // (Pavlovia handles output dirs; validation warnings written to console)
  if (!ID)                              console.warn('Participant ID is empty.');
  if (peerNames.some(n => n === ''))    console.warn('One or more Peer name fields are empty.');

  // ── intro image ─────────────────────────────
  introStim = new visual.ImageStim({
    win, name: 'introStim',
    image: 'stim/04_intro/intro.png',
    pos: [0, 0], units: 'height',
    anchor: 'center',
  });
  introKey = new core.Keyboard({ psychoJS, clock: new util.Clock(), waitForStart: true });

  // ── fixation image (reused every fixation period) ──
  fixStim = new visual.ImageStim({
    win, name: 'fixStim',
    image: 'stim/00_fixation/fixation.png',
    pos: [0, 0], size: [0.12, 0.12], units: 'height',
  });

  // ── product image (src swapped each trial) ──
  productStim = new visual.ImageStim({
    win, name: 'productStim',
    image: 'stim/00_fixation/fixation.png',  // placeholder; overwritten per-trial
    pos: [0, 0.05], units: 'height',
    anchor: 'center',
  });

  // ── endorsement info image (src swapped each trial) ──
  infoStim = new visual.ImageStim({
    win, name: 'infoStim',
    image: 'stim/00_fixation/fixation.png',  // placeholder
    pos: [0, 0.05], units: 'height',
    anchor: 'center',
  });

  // ── endorser label text  (text swapped each trial) ──
  //    mirrors make_info_label() — pos maps label_x / label_y
  labelStim = new visual.TextStim({
    win, name: 'labelStim',
    text: '',
    pos:  [CFG.label_x, CFG.label_y],
    height: CFG.text_height_big,
    color: CFG.text_color,
    font: CFG.font,
    bold: CFG.text_bold,
    alignText: 'left',
    anchorHoriz: 'left',
    anchorVert: 'top',
    units: 'height',
    wrapWidth: 0.9,
  });

  // ── question background image (src swapped per question) ──
  questionStim = new visual.ImageStim({
    win, name: 'questionStim',
    image: 'stim/03_question/credibility_general.png', // placeholder
    pos: [0, 0.1], units: 'height',
    anchor: 'center',
  });

  // ── Likert scale  (mirrors LikertScale.__init__) ─────────────
  //    circles, numbers, and endpoint labels built once; text swapped per question
  const xs = linspace(CFG.scale_x_left, CFG.scale_x_right, CFG.scale_n);

  for (let i = 0; i < CFG.scale_n; i++) {
    scale_circles.push(new visual.Polygon({
      win,
      edges:       64,
      radius:      CFG.circle_radius,
      lineColor:   CFG.text_color,
      lineWidth:   4,
      fillColor:   null,
      pos:         [xs[i], CFG.scale_y],
      units:       'height',
    }));
    scale_numbers.push(new visual.TextStim({
      win,
      text:       String(i + 1),
      pos:        [xs[i], CFG.numbers_y],
      height:     CFG.text_height_medium,
      color:      CFG.text_color,
      font:       CFG.font,
      bold:       CFG.text_bold,
      alignText:  'center',
      units:      'height',
    }));
  }

  // Endpoint label stims – text updated per question  (mirrors left_desc / right_desc)
  scale_leftDesc = new visual.TextStim({
    win,
    text:        '',
    pos:         [CFG.scale_x_left  - 2 * CFG.circle_radius, CFG.desc_y],
    height:      CFG.text_height_small,
    color:       CFG.text_color,
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
    color:       CFG.text_color,
    font:        CFG.font,
    bold:        CFG.text_bold,
    alignText:   'right',
    anchorHoriz: 'right',
    units:       'height',
    wrapWidth:   0.4,
  });

  // Keyboard for scale navigation (arrow keys + return)
  scaleKb = new core.Keyboard({ psychoJS, clock: new util.Clock(), waitForStart: true });

  // ── load expert labels CSV ──────────────────
  // serverManager.getResource() returns the raw text of a pre-registered CSV.
  // parseCSV() converts it to an array of row objects (replaces data.importConditions).
  const expertRows = parseCSV(psychoJS.serverManager.getResource('expert_labels.csv'));
  expertRows.forEach(row => {
    expertMap[normStr(row.product_ENG)] = String(row.expert_label).trim();
  });

  // ── load & validate product list CSV ────────
  const productRows = parseCSV(psychoJS.serverManager.getResource('product_list.csv'));

  // required columns
  const reqCols = ['product_ENG', 'product_KOR', 'genre', 'classification', 'price_range'];
  const missingCols = reqCols.filter(c => !(c in productRows[0]));
  if (missingCols.length > 0) throw new Error(`product_list.csv missing columns: ${missingCols}`);

  // validate expert label coverage
  const missingExperts = productRows
    .filter(r => !(normStr(r.product_ENG) in expertMap))
    .map(r => r.product_ENG);
  if (missingExperts.length > 0)
    console.warn('No expert label for:', missingExperts);

  // ── constrained trial shuffle  ───────────────
  trialRows = constrainedShuffle(
    productRows,
    r => `${r.genre}|${r.classification}|${r.price_range}`,
    CFG.max_run,
  );

  const nTrials = trialRows.length;

  // ── assign info types ────────────────────────
  const infoTypes = Object.keys(INFO_CODE_MAP);   // ['expert','consensus','peer','gpt']
  if (CFG.debug) {
    infoAssignment = Array(nTrials).fill(CFG.debug_info_type);
  } else {
    infoAssignment = assignInfoTypesBalanced(trialRows, infoTypes, CFG.max_run);
  }

  // ── build question-order pools ───────────────
  const allOrdersGPT   = permutations(GPT_QUESTIONS);
  const allOrdersOther = permutations(OTHER_QUESTIONS);

  qOrdersGPT   = buildBalancedQuestionOrders(allOrdersGPT,   nTrials, CFG.question_order_max_run);
  qOrdersOther = buildBalancedQuestionOrders(allOrdersOther, nTrials, CFG.question_order_max_run);

  gptCounter   = 0;
  otherCounter = 0;
  trialIndex   = 0;

  return Scheduler.Event.NEXT;
}


// ─────────────────────────────────────────────
//  7. INTRO ROUTINE  (mirrors show_intro())
//     Displays intro.png until SPACE or RETURN
// ─────────────────────────────────────────────

let introComponents;

function introRoutineBegin() {
  return async function () {
    introClock.reset();
    introKey.keys     = undefined;
    introKey.rt       = undefined;
    introKey._allKeys = [];
    introComponents = [introStim, introKey];
    for (const c of introComponents) if ('status' in c) c.status = PsychoJS.Status.NOT_STARTED;
    psychoJS.experiment.addData('intro.started', globalClock.getTime());
    return Scheduler.Event.NEXT;
  };
}

function introRoutineEachFrame() {
  return async function () {
    const t = introClock.getTime();

    if (t >= 0 && introStim.status === PsychoJS.Status.NOT_STARTED) {
      introStim.tStart = t;
      introStim.setAutoDraw(true);
    }
    if (t >= 0 && introKey.status === PsychoJS.Status.NOT_STARTED) {
      introKey.tStart = t;
      psychoJS.window.callOnFlip(() => { introKey.clock.reset(); });
      psychoJS.window.callOnFlip(() => { introKey.start(); });
      psychoJS.window.callOnFlip(() => { introKey.clearEvents(); });
    }
    if (introKey.status === PsychoJS.Status.STARTED) {
      const keys = introKey.getKeys({ keyList: ['space', 'return', 'escape'], waitRelease: false });
      introKey._allKeys = introKey._allKeys.concat(keys);
      if (introKey._allKeys.length > 0) {
        const last = introKey._allKeys[introKey._allKeys.length - 1];
        if (last.name === 'escape') return quitPsychoJS('Escape pressed', false);
        introStim.setAutoDraw(false);
        return Scheduler.Event.NEXT;
      }
    }
    if (psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape pressed', false);
    return Scheduler.Event.FLIP_REPEAT;
  };
}

function introRoutineEnd() {
  return async function () {
    introStim.setAutoDraw(false);
    psychoJS.experiment.addData('intro.stopped', globalClock.getTime());
    if (currentLoop === psychoJS.experiment) psychoJS.experiment.nextEntry();
    return Scheduler.Event.NEXT;
  };
}


// ─────────────────────────────────────────────
//  8. INITIAL FIXATION (3 s, mirrors show_fixation(win, 3, 3))
// ─────────────────────────────────────────────

let introFixComponents;
let introFixDuration = 3.0;

function introFixRoutineBegin() {
  return async function () {
    introFixClock.reset();
    routineTimer.reset();
    routineTimer.add(introFixDuration);
    introFixComponents = [fixStim];
    for (const c of introFixComponents) if ('status' in c) c.status = PsychoJS.Status.NOT_STARTED;
    return Scheduler.Event.NEXT;
  };
}

function introFixRoutineEachFrame() {
  return async function () {
    const t = introFixClock.getTime();
    if (t >= 0 && fixStim.status === PsychoJS.Status.NOT_STARTED) {
      fixStim.tStart = t;
      fixStim.setAutoDraw(true);
    }
    if (psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape pressed', false);
    if (routineTimer.getTime() <= 0) {
      fixStim.setAutoDraw(false);
      return Scheduler.Event.NEXT;
    }
    return Scheduler.Event.FLIP_REPEAT;
  };
}

function introFixRoutineEnd() {
  return async function () {
    fixStim.setAutoDraw(false);
    return Scheduler.Event.NEXT;
  };
}


// ─────────────────────────────────────────────
//  9. TRIAL LOOP  (mirrors the for t_idx, trial in enumerate(trials) loop)
// ─────────────────────────────────────────────

function trialsLoopBegin(loopScheduler) {
  return async function () {
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
//      Phase order (mirrors behavioral_opt.py):
//      product → fixation → info → fixation → [per question: question → fixation]
// ─────────────────────────────────────────────

// State shared across the Begin/EachFrame/End trio for one trial
let _trialPhase;       // 'product' | 'fix1' | 'info' | 'fix2' | 'question' | 'interQ_fix' | 'done'
let _phaseStartT;
let _phaseDuration;
let _trialClock;
let _currentTrial;
let _currentInfoType;
let _currentLabelText;
let _currentQOrder;
let _qIdx;            // index into _currentQOrder
let _qSelectedCircle; // 0-based index of highlighted circle, null = none
let _qResponseGiven;
let _qStartT;
let _interQFixDuration;

// Per-trial result accumulators
let _trialResults;    // { credEX:{score,rt}, ... }

function trialRoutineBegin(tIdx) {
  return async function () {
    trialIndex = tIdx + 1;
    _currentTrial    = trialRows[tIdx];
    _currentInfoType = infoAssignment[tIdx];
    _trialClock      = new util.Clock();
    _trialResults    = {};

    // ── resolve endorser label ───────────────
    const peerName    = (_currentInfoType === 'peer')
      ? peerNames[Math.floor(Math.random() * peerNames.length)]
      : null;
    const expertLabel = (_currentInfoType === 'expert')
      ? (expertMap[normStr(_currentTrial.product_ENG)] || null)
      : null;
    _currentLabelText = resolveLabel(_currentInfoType, peerName, expertLabel);

    // ── choose question order ────────────────
    if (_currentInfoType === 'gpt') {
      _currentQOrder = [...qOrdersGPT[gptCounter % qOrdersGPT.length]];
      gptCounter++;
    } else {
      _currentQOrder = [...qOrdersOther[otherCounter % qOrdersOther.length]];
      otherCounter++;
    }
    _qIdx = 0;

    // ── set product image ────────────────────
    const prodFile = `stim/01_product/${_currentTrial.product_ENG}.png`;
    productStim.setImage(prodFile);

    // ── set info image ───────────────────────
    const suffix   = INFO_CODE_MAP[_currentInfoType];
    const infoFile = `stim/02_information/${_currentTrial.product_ENG}_${suffix}.png`;
    infoStim.setImage(infoFile);

    // ── write trial metadata to data file ────
    psychoJS.experiment.addData('TrialNumber',      trialIndex);
    psychoJS.experiment.addData('product_ENG',      _currentTrial.product_ENG);
    psychoJS.experiment.addData('product_KOR',      _currentTrial.product_KOR);
    psychoJS.experiment.addData('genre',            _currentTrial.genre);
    psychoJS.experiment.addData('classification',   _currentTrial.classification);
    psychoJS.experiment.addData('price_range',      _currentTrial.price_range);
    psychoJS.experiment.addData('InfoType',         _currentInfoType);
    psychoJS.experiment.addData('Q_Order',          _currentQOrder.join('-'));
    psychoJS.experiment.addData('LabelText',        _currentLabelText || '');

    // ── initial fixation phase ───────────────
    _phaseDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
    _phaseStartT   = _trialClock.getTime();
    _trialPhase    = 'fix0';

    fixStim.setAutoDraw(false);
    productStim.setAutoDraw(false);
    infoStim.setAutoDraw(false);
    labelStim.setAutoDraw(false);
    questionStim.setAutoDraw(false);
    scale_circles.forEach(c => c.setAutoDraw(false));
    scale_numbers.forEach(n => n.setAutoDraw(false));
    if (scale_leftDesc)  scale_leftDesc.setAutoDraw(false);
    if (scale_rightDesc) scale_rightDesc.setAutoDraw(false);

    return Scheduler.Event.NEXT;
  };
}

function trialRoutineEachFrame(tIdx) {
  return async function () {
    const t = _trialClock.getTime();

    if (psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape pressed', false);

    // ══════════════════════════════════════════
    //  STATE MACHINE  (one phase per frame tick)
    // ══════════════════════════════════════════

    // ── PHASE: initial jittered fixation (fix0) ──
    if (_trialPhase === 'fix0') {
      if (t === _phaseStartT || fixStim.status === PsychoJS.Status.NOT_STARTED) {
        fixStim.setAutoDraw(true);
      }
      if ((t - _phaseStartT) >= _phaseDuration) {
        fixStim.setAutoDraw(false);
        psychoJS.experiment.addData('fix0.started', _phaseStartT);
        psychoJS.experiment.addData('fix0.stopped', t);
        // → product phase
        _phaseStartT  = t;
        _phaseDuration = CFG.product_dur;
        _trialPhase    = 'product';
        productStim.setAutoDraw(true);
        psychoJS.experiment.addData('product.started', _phaseStartT);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── PHASE: product display ──
    if (_trialPhase === 'product') {
      if ((t - _phaseStartT) >= _phaseDuration) {
        productStim.setAutoDraw(false);
        psychoJS.experiment.addData('product.stopped', t);
        // → jittered fixation between product and info
        _phaseDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
        _phaseStartT   = t;
        _trialPhase    = 'fix1';
        fixStim.setAutoDraw(true);
        psychoJS.experiment.addData('fix1.started', _phaseStartT);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── PHASE: fixation between product and info (fix1) ──
    if (_trialPhase === 'fix1') {
      if ((t - _phaseStartT) >= _phaseDuration) {
        fixStim.setAutoDraw(false);
        psychoJS.experiment.addData('fix1.stopped', t);
        // → info phase
        _phaseStartT   = t;
        _phaseDuration = CFG.info_dur;
        _trialPhase    = 'info';
        // show info image + label
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

    // ── PHASE: endorsement info display ──
    if (_trialPhase === 'info') {
      if ((t - _phaseStartT) >= _phaseDuration) {
        infoStim.setAutoDraw(false);
        labelStim.setAutoDraw(false);
        psychoJS.experiment.addData('info.stopped', t);
        // → fixation between info and first question
        _phaseDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
        _phaseStartT   = t;
        _trialPhase    = 'fix2';
        fixStim.setAutoDraw(true);
        psychoJS.experiment.addData('fix2.started', _phaseStartT);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── PHASE: fixation before question block (fix2) ──
    if (_trialPhase === 'fix2') {
      if ((t - _phaseStartT) >= _phaseDuration) {
        fixStim.setAutoDraw(false);
        psychoJS.experiment.addData('fix2.stopped', t);
        _trialPhase = 'question_init';
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── PHASE: initialise current question ──
    if (_trialPhase === 'question_init') {
      if (_qIdx >= _currentQOrder.length) {
        // All questions done → advance to next trial
        _trialPhase = 'done';
        return Scheduler.Event.NEXT;
      }
      const qKey = _currentQOrder[_qIdx];
      const qDef = QUESTION_DEFS[qKey];
      questionStim.setImage(qDef.img);
      if (_currentLabelText) {
        labelStim.setText(_currentLabelText);
        labelStim.setAutoDraw(true);
      }
      scale_leftDesc.setText(qDef.left);
      scale_rightDesc.setText(qDef.right);
      // reset selection state (mirrors scale.reset())
      _qSelectedCircle = null;
      _qResponseGiven  = false;
      // reset and start keyboard
      scaleKb.keys     = undefined;
      scaleKb.rt       = undefined;
      scaleKb._allKeys  = [];
      psychoJS.window.callOnFlip(() => { scaleKb.clock.reset(); });
      psychoJS.window.callOnFlip(() => { scaleKb.start(); });
      psychoJS.window.callOnFlip(() => { scaleKb.clearEvents(); });
      // draw scale
      questionStim.setAutoDraw(true);
      scale_circles.forEach((c, i) => {
        c.setFillColor(null);
        c.setAutoDraw(true);
      });
      scale_numbers.forEach(n => n.setAutoDraw(true));
      scale_leftDesc.setAutoDraw(true);
      scale_rightDesc.setAutoDraw(true);
      _qStartT    = _trialClock.getTime();
      _trialPhase = 'question';
      psychoJS.experiment.addData(`${qKey}.started`, _qStartT);
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── PHASE: question response loop  (mirrors show_question / handle_key) ──
    if (_trialPhase === 'question') {
      const qKey = _currentQOrder[_qIdx];

      // Poll keyboard
      const newKeys = scaleKb.getKeys({ keyList: ['left', 'right', 'return', 'escape'], waitRelease: false });
      scaleKb._allKeys = (scaleKb._allKeys || []).concat(newKeys);

      for (const k of newKeys) {
        if (k.name === 'escape') return quitPsychoJS('Escape pressed', false);

        const n = CFG.scale_n;
        if (k.name === 'left') {
          _qSelectedCircle = (_qSelectedCircle === null)
            ? Math.floor(n / 2)
            : Math.max(0, _qSelectedCircle - 1);
        } else if (k.name === 'right') {
          _qSelectedCircle = (_qSelectedCircle === null)
            ? Math.floor(n / 2)
            : Math.min(n - 1, _qSelectedCircle + 1);
        } else if (k.name === 'return' && _qSelectedCircle !== null) {
          // Confirmed response
          const score = _qSelectedCircle + 1;
          const rt    = k.rt;          // RT relative to scaleKb.clock (reset at question start)
          _trialResults[qKey] = { score, rt };
          psychoJS.experiment.addData(`${qKey}_val`, score);
          psychoJS.experiment.addData(`${qKey}_RT`,  rt);
          psychoJS.experiment.addData(`${qKey}.stopped`, _trialClock.getTime());
          _qResponseGiven = true;
        }
      }

      // Update circle fill colours  (selected = 'red', others = null, mirrors LikertScale.draw)
      scale_circles.forEach((c, i) => {
        c.setFillColor(i === _qSelectedCircle ? new util.Color('red') : null);
      });

      if (_qResponseGiven) {
        // hide scale
        questionStim.setAutoDraw(false);
        labelStim.setAutoDraw(false);
        scale_circles.forEach(c => c.setAutoDraw(false));
        scale_numbers.forEach(n => n.setAutoDraw(false));
        scale_leftDesc.setAutoDraw(false);
        scale_rightDesc.setAutoDraw(false);
        scaleKb.stop();

        _qIdx++;
        // inter-question jittered fixation
        _interQFixDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
        _phaseStartT       = _trialClock.getTime();
        _trialPhase        = 'interQ_fix';
        fixStim.setAutoDraw(true);
      }

      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── PHASE: inter-question fixation ──
    if (_trialPhase === 'interQ_fix') {
      if ((_trialClock.getTime() - _phaseStartT) >= _interQFixDuration) {
        fixStim.setAutoDraw(false);
        _trialPhase = 'question_init';   // go to next question
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── PHASE: done ──
    return Scheduler.Event.NEXT;
  };
}

function trialRoutineEnd(tIdx) {
  return async function () {
    // Ensure everything is hidden
    fixStim.setAutoDraw(false);
    productStim.setAutoDraw(false);
    infoStim.setAutoDraw(false);
    labelStim.setAutoDraw(false);
    questionStim.setAutoDraw(false);
    scale_circles.forEach(c => c.setAutoDraw(false));
    scale_numbers.forEach(n => n.setAutoDraw(false));
    if (scale_leftDesc)  scale_leftDesc.setAutoDraw(false);
    if (scale_rightDesc) scale_rightDesc.setAutoDraw(false);

    // Write any not-yet-written question columns as empty strings
    const allQs = ['credEX', 'credCON', 'credPEER', 'credGen', 'preference'];
    allQs.forEach(q => {
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


// ─────────────────────────────────────────────
//  12. UTILITY
// ─────────────────────────────────────────────

// numpy linspace equivalent
function linspace(start, stop, num) {
  if (num === 1) return [start];
  const step = (stop - start) / (num - 1);
  return Array.from({ length: num }, (_, i) => start + i * step);
}

/**
 * parseCSV(text)
 * Minimal RFC-4180 CSV parser.
 * Handles quoted fields (including embedded commas and newlines),
 * trims whitespace from unquoted values, and returns an array of
 * plain objects keyed by the header row.
 *
 * This replaces data.importConditions(), which does not exist in
 * PsychoJS 2026. serverManager.getResource(name) returns the raw
 * file text for CSV resources; pass that string directly here.
 */
function parseCSV(text) {
  // Normalise line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Tokenise: split into fields respecting quoted strings
  function tokeniseLine(line) {
    const fields = [];
    let i = 0;
    while (i <= line.length) {
      if (line[i] === '"') {
        // Quoted field
        let field = '';
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            field += '"'; i += 2; // escaped quote
          } else if (line[i] === '"') {
            i++; break;            // closing quote
          } else {
            field += line[i++];
          }
        }
        fields.push(field);
        if (line[i] === ',') i++; // skip separator
      } else {
        // Unquoted field — read until next comma or end
        const start = i;
        while (i < line.length && line[i] !== ',') i++;
        fields.push(line.slice(start, i).trim());
        if (line[i] === ',') i++;
      }
      if (i > line.length) break;
    }
    return fields;
  }

  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return [];

  const headers = tokeniseLine(lines[0]);
  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const vals = tokeniseLine(lines[li]);
    const obj  = {};
    headers.forEach((h, hi) => { obj[h.trim()] = vals[hi] !== undefined ? vals[hi] : ''; });
    rows.push(obj);
  }
  return rows;
}

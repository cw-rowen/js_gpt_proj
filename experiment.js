import { core, data, util, visual } from './lib/psychojs-2026.1.3.js';
const { PsychoJS } = core;
const { TrialHandler } = data;
const { Scheduler } = util;

// ─────────────────────────────────────────────
//  1. CONFIGURATION
// ─────────────────────────────────────────────

const CFG = {
  product_dur:            4.0,
  info_dur:               9.0,
  fix_min:                0.5,
  fix_max:                1.5,

  // randomization parameters 
  max_run:                2,
  question_order_max_run: 3,

  bg_color:               'black',

  // text 
  font:                   'NanumGothic',
  text_height_big:        0.06,
  text_height_medium:     0.04,
  text_height_small:      0.04,
  text_bold:              true,
  text_color:             'white',

  // scale 
  scale_n:                7,
  circle_radius:          0.045,
  scale_y:               -0.15,
  numbers_y:             -0.265,
  desc_y:                -0.33,
  scale_x_left:          -0.42,
  scale_x_right:          0.42,

  // endorser label location
  label_x:               -0.45,
  label_y:                0.35,
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
const CSV_NAME_MAP = {
  credEX:     'Credibility_EX',
  credCON:    'Credibility_CON',
  credPEER:   'Credibility_PEER',
  credGen:    'Credibility_general',
  preference: 'Preference',
};
const GPT_QUESTIONS   = ['credEX', 'credCON', 'credPEER', 'credGen', 'preference'];
const OTHER_QUESTIONS = ['credGen', 'preference'];
const ALL_Q_KEYS      = ['credEX', 'credCON', 'credPEER', 'credGen', 'preference'];


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
  console.warn('constrainedShuffle: returning last attempt');
  return rows;
}

function assignInfoTypesBalanced(rows, infoTypes, maxRun = 2, maxTries = 5000) {
  const combo = r => `${r.genre}|${r.classification}|${r.price_range}`;
  const n = rows.length, combos = rows.map(combo);
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const overall = {}, perCombo = {}, assigned = [];
    let ok = true;
    for (let i = 0; i < n; i++) {
      const ck = combos[i];
      let candidates = [...infoTypes];
      if (assigned.length >= maxRun &&
          assigned.slice(-maxRun).every(x => x === assigned[assigned.length - 1]))
        candidates = candidates.filter(t => t !== assigned[assigned.length - 1]);
      if (!candidates.length) { ok = false; break; }
      if (!perCombo[ck]) perCombo[ck] = {};
      const scored = candidates.map(t => [perCombo[ck][t]||0, overall[t]||0, Math.random(), t]);
      scored.sort((a,b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2]);
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
      const chunk = [...allOrders]; shuffleInPlace(chunk); pool.push(...chunk);
    }
    pool = pool.slice(0, nTrials);
    const arranged = []; let remaining = [...pool];
    while (remaining.length > 0) {
      const valid = remaining.filter(o => isValidPositionRuns(arranged, o, maxRun));
      if (!valid.length) break;
      const chosen = valid[Math.floor(Math.random() * valid.length)];
      arranged.push(chosen); remaining.splice(remaining.indexOf(chosen), 1);
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

function normStr(s) { return String(s).trim().toLowerCase().replace(/\s+/g, ' '); }

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

function trialResources(trial, infoType) {
  const prod = `stim/01_product/${trial.product_ENG}.png`;
  const info = `stim/02_information/${trial.product_ENG}_${INFO_CODE_MAP[infoType]}.png`;
  return [{ name: prod, path: prod }, { name: info, path: info }];
}


// ─────────────────────────────────────────────
//  3. PSYCHOJS BOOTSTRAP
// ─────────────────────────────────────────────

const psychoJS = new PsychoJS({});

const expInfo = {
  '참가자 ID': '',
  '친구 이름 1': '',
  '친구 이름 2': '',
  '친구 이름 3': '',
  '친구 이름 4': '',
};



psychoJS.openWindow({
  fullscr:         true,
  color:           new util.Color(CFG.bg_color),
  units:           'height',
  waitBlanking:    true,
  backgroundImage: '',
  backgroundFit:   'none',
});
document.body.style.cursor = 'none';
psychoJS.window._renderer.view.style.cursor = 'none';


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
  expName: 'Endorsement Study',
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
    { name: 'default.png', path: 'https://pavlovia.org/assets/default/default.png' },
  ],
});

psychoJS.experimentLogger.setLevel(core.Logger.ServerLevel.EXP);


// ─────────────────────────────────────────────
//  4. GLOBAL STATE
// ─────────────────────────────────────────────

let globalClock, routineTimer, currentLoop, frameDur;
let introClock, introStim, introKey, introFixClock;
let fixStim, productStim, infoStim, labelStim, questionStim;
let scale_circles = [], scale_numbers = [];
let scale_leftDesc = null, scale_rightDesc = null;

let trialRows = [], infoAssignment = [], qOrdersGPT = [], qOrdersOther = [];
let expertMap = {}, peerNames = [];
let gptCounter = 0, otherCounter = 0, trialIndex = 0;

// Colours for circle fill.
// IMPORTANT: undefined / null do not reliably clear fill in PsychoJS.
// Use an explicit transparent colour (RGBA [0,0,0,0]) for "no fill",
// and 'red' for the selected circle – matching Python's fillColor="red" / None.
let _colRed, _colClear;


// ─────────────────────────────────────────────
//  5. updateInfo
// ─────────────────────────────────────────────

async function updateInfo() {
  currentLoop = psychoJS.experiment;
  const englishData = {
    'Participant ID': expInfo['참가자 ID'],
    'Peer 1':         expInfo['친구 이름 1'],
    'Peer 2':         expInfo['친구 이름 2'],
    'Peer 3':         expInfo['친구 이름 3'],
    'Peer 4':         expInfo['친구 이름 4'],
  };

  // Overwrite expInfo with the English keys so the CSV uses them
  Object.assign(expInfo, englishData);

  // Clean up the Korean keys so they don't appear in the CSV
  delete expInfo['참가자 ID'];
  delete expInfo['친구 이름 1'];
  delete expInfo['친구 이름 2'];
  delete expInfo['친구 이름 3'];
  delete expInfo['친구 이름 4'];

  expInfo['date']            = util.MonotonicClock.getDateStr();
  expInfo['expName']         = 'Endorsement Study';
  expInfo['psychopyVersion'] = '2026.1.3';
  expInfo['frameRate']       = psychoJS.window.getActualFrameRate();
  frameDur = (typeof expInfo['frameRate'] !== 'undefined')
    ? 1.0 / Math.round(expInfo['frameRate']) : 1.0 / 60.0;
  util.addInfoFromUrl(expInfo);


  psychoJS.experiment.dataFileName =
    `data/${expInfo['Participant ID']}_EndorsementStudy_${expInfo['date']}`;
  
  return Scheduler.Event.NEXT;

}


// ─────────────────────────────────────────────
//  6. experimentInit
// ─────────────────────────────────────────────

async function experimentInit() {
  const win = psychoJS.window;


  introClock    = new util.Clock();
  introFixClock = new util.Clock();
  globalClock   = new util.Clock();
  routineTimer  = new util.CountdownTimer();

  const ID = String(expInfo['Participant ID']).trim();
  peerNames = [1,2,3,4].map(i => String(expInfo[`Peer ${i}`]).trim());
  if (!ID)                           console.warn('Participant ID is empty.');
  if (peerNames.some(n => n === '')) console.warn('A peer name field is empty.');

  // ── colour constants (built after psychoJS is ready) ─────────────────────
  _colRed   = new util.Color('red');
  _colClear = new util.Color(CFG.bg_color);

  // ── stimuli ───────────────────────────────────────────────────────────────

  introStim = new visual.ImageStim({
    win, name: 'introStim',
    image: 'stim/04_intro/intro.png',
    pos: [0, 0], units: 'height', anchor: 'center',
  });
  introKey = new core.Keyboard({ psychoJS, clock: new util.Clock(), waitForStart: true });

  fixStim = new visual.ImageStim({
    win, name: 'fixStim',
    image: 'stim/00_fixation/fixation.png',
    pos: [0, 0], units: 'height', anchor: 'center',
  });

  productStim = new visual.ImageStim({
    win, name: 'productStim',
    image: 'default.png',
    pos: [0, 0], units: 'height', anchor: 'center',
  });

  infoStim = new visual.ImageStim({
    win, name: 'infoStim',
    image: 'default.png',
    pos: [0, 0], units: 'height', anchor: 'center',
  });

  // Label rendered above the info/question image.
  // depth:-1 means it draws in front of depth:0 stims (infoStim, questionStim).
  labelStim = new visual.TextStim({
    win, name: 'labelStim',
    text:        '',
    pos:         [CFG.label_x, CFG.label_y],
    height:      CFG.text_height_big,
    color:       new util.Color(CFG.text_color),
    font:        CFG.font,
    bold:        CFG.text_bold,
    alignText:   'left',
    anchorHoriz: 'left',
    units:       'height',
    wrapWidth:   undefined,
    depth:       -1,
  });

  // Question background PNG – scale is drawn on top of it (scale depth:-1).
  questionStim = new visual.ImageStim({
    win, name: 'questionStim',
    image: 'stim/03_question/credibility_general.png',
    pos: [0, 0], units: 'height', anchor: 'center',
    depth: 0,
  });

  // ── Likert scale ──────────────────────────────────────────────────────────
  // depth:-1 so scale elements render in front of questionStim (depth:0).
  // This matches Python: circles/numbers/labels are drawn after bg image.
  const xs       = linspace(CFG.scale_x_left, CFG.scale_x_right, CFG.scale_n);
  const colWhite = new util.Color(CFG.text_color);

  for (let i = 0; i < CFG.scale_n; i++) {
    scale_circles.push(new visual.Polygon({
      win, name: `circle_${i}`,
      edges:     64,
      radius:    CFG.circle_radius,
      lineColor: colWhite,
      lineWidth: 4,
      fillColor: _colClear,   // transparent initially, set to _colRed when selected
      pos:       [xs[i], CFG.scale_y],
      units:     'height',
      depth:     -1,
    }));
    scale_numbers.push(new visual.TextStim({
      win, name: `num_${i}`,
      text:      String(i + 1),
      pos:       [xs[i], CFG.numbers_y],
      height:    CFG.text_height_medium,
      color:     colWhite,
      font:      CFG.font,
      bold:      CFG.text_bold,
      alignText: 'center',
      units:     'height',
      depth:     -1,
    }));
  }

  scale_leftDesc = new visual.TextStim({
    win, name: 'scale_leftDesc',
    text:        '',
    pos:         [CFG.scale_x_left - 2 * CFG.circle_radius, CFG.desc_y],
    height:      CFG.text_height_small,
    color:       colWhite, font: CFG.font, bold: CFG.text_bold,
    alignText:   'left', anchorHoriz: 'left',
    units:       'height', wrapWidth: 0.4,
    depth:       -1,
  });
  scale_rightDesc = new visual.TextStim({
    win, name: 'scale_rightDesc',
    text:        '',
    pos:         [CFG.scale_x_right + 2 * CFG.circle_radius, CFG.desc_y],
    height:      CFG.text_height_small,
    color:       colWhite, font: CFG.font, bold: CFG.text_bold,
    alignText:   'right', anchorHoriz: 'right',
    units:       'height', wrapWidth: 0.4,
    depth:       -1,
  });

  // ── parse expert_labels.csv (no header row) ───────────────────────────────
  try {
    const raw = await (await fetch('expert_labels.csv')).text();
    raw.trim().split('\n').forEach(line => {
      const parts = line.split(',');
      if (parts.length >= 2)
        expertMap[normStr(parts[0])] = parts.slice(1).join(',').trim();
    });
  } catch (e) { console.warn('expert_labels.csv fetch failed:', e); }

  // ── parse product_list.csv ────────────────────────────────────────────────
  // Use .trialList directly – a plain array. for-of on TrialHandler only
  // yields one item in PsychoJS (the handler is its own single-use iterator).
  const _productHandler = new TrialHandler({
    psychoJS, nReps: 1,
    method: TrialHandler.Method.SEQUENTIAL,
    trialList: 'product_list.csv',
    name: '_productLoader',
  });
  const productRows = _productHandler.trialList;
  if (!productRows || productRows.length === 0)
    throw new Error('product_list.csv loaded 0 rows.');

  const reqCols     = ['product_ENG', 'product_KOR', 'genre', 'classification', 'price_range'];
  const missingCols = reqCols.filter(c => !(c in productRows[0]));
  if (missingCols.length) throw new Error(`product_list.csv missing: ${missingCols}`);

  const missingExperts = productRows
    .filter(r => !(normStr(r.product_ENG) in expertMap)).map(r => r.product_ENG);
  if (missingExperts.length) console.warn('No expert label for:', missingExperts);

  // ── shuffle + assign ──────────────────────────────────────────────────────
  trialRows = constrainedShuffle(
    productRows, r => `${r.genre}|${r.classification}|${r.price_range}`, CFG.max_run
  );
  const nTrials  = trialRows.length;
  const infoTypes = Object.keys(INFO_CODE_MAP);
  infoAssignment = assignInfoTypesBalanced(trialRows, infoTypes, CFG.max_run);

  qOrdersGPT   = buildBalancedQuestionOrders(permutations(GPT_QUESTIONS),   nTrials, CFG.question_order_max_run);
  qOrdersOther = buildBalancedQuestionOrders(permutations(OTHER_QUESTIONS), nTrials, CFG.question_order_max_run);
  gptCounter = 0; otherCounter = 0; trialIndex = 0;

  if (nTrials > 0) await prefetchTrialImages(0);
  return Scheduler.Event.NEXT;
}


// ─────────────────────────────────────────────
//  LAZY-LOAD HELPER
// ─────────────────────────────────────────────

const _fetchedTrials = new Set();

async function prefetchTrialImages(tIdx) {
  if (tIdx >= trialRows.length || _fetchedTrials.has(tIdx)) return;

  try {
    await psychoJS.serverManager.prepareResources(
      trialResources(trialRows[tIdx], infoAssignment[tIdx])
    );

    _fetchedTrials.add(tIdx);

  } catch (e) {
    console.warn(`prefetchTrialImages(${tIdx}) failed:`, e);
  }
}

// ─────────────────────────────────────────────
//  7. INTRO ROUTINE
// ─────────────────────────────────────────────

let introComponents;
var t, continueRoutine;

function introRoutineBegin() {
  return async function () {
    t = 0; introClock.reset(); continueRoutine = true;
    introKey.keys = undefined; introKey.rt = undefined; introKey._allKeys = [];
    introComponents = [introStim, introKey];
    for (const c of introComponents) if ('status' in c) c.status = PsychoJS.Status.NOT_STARTED;
    // No addData here – any addData before the first nextEntry() writes into
    // trial 1's CSV row and corrupts the output.
    return Scheduler.Event.NEXT;
  };
}

function introRoutineEachFrame() {
  return async function () {
    t = introClock.getTime();

    if (t >= 0 && introStim.status === PsychoJS.Status.NOT_STARTED) {
      introStim.tStart = t; introStim.status = PsychoJS.Status.STARTED;
      introStim.setAutoDraw(true);
    }
    if (t >= 0 && introKey.status === PsychoJS.Status.NOT_STARTED) {
      introKey.tStart = t; introKey.status = PsychoJS.Status.STARTED;
      psychoJS.window.callOnFlip(() => { introKey.clock.reset(); introKey.start(); introKey.clearEvents(); });
    }
    if (introKey.status === PsychoJS.Status.STARTED) {
      const keys = introKey.getKeys({ keyList: ['space', 'return', 'escape'], waitRelease: false });
      introKey._allKeys = introKey._allKeys.concat(keys);
      if (introKey._allKeys.length > 0) {
        const last = introKey._allKeys[introKey._allKeys.length - 1];
        if (last.name === 'escape') return quitPsychoJS('Escape pressed', false);
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
    for (const c of introComponents) if (typeof c.setAutoDraw === 'function') c.setAutoDraw(false);
    introKey.stop(); routineTimer.reset();
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
    t = 0; introFixClock.reset(); continueRoutine = true;
    routineTimer.reset(); routineTimer.add(INTRO_FIX_DUR);
    introFixComponents = [fixStim];
    for (const c of introFixComponents) if ('status' in c) c.status = PsychoJS.Status.NOT_STARTED;
    return Scheduler.Event.NEXT;
  };
}

function introFixRoutineEachFrame() {
  return async function () {
    t = introFixClock.getTime();
    if (t >= 0 && fixStim.status === PsychoJS.Status.NOT_STARTED) {
      fixStim.tStart = t; fixStim.status = PsychoJS.Status.STARTED; fixStim.setAutoDraw(true);
    }
    if (psychoJS.experiment.experimentEnded ||
        psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape pressed', false);
    if (continueRoutine && routineTimer.getTime() > 0) return Scheduler.Event.FLIP_REPEAT;
    fixStim.setAutoDraw(false); fixStim.status = PsychoJS.Status.FINISHED;
    routineTimer.reset();
    return Scheduler.Event.NEXT;
  };
}

function introFixRoutineEnd() {
  return async function () {
    for (const c of introFixComponents) if (typeof c.setAutoDraw === 'function') c.setAutoDraw(false);
    routineTimer.reset();
    return Scheduler.Event.NEXT;
  };
}


// ─────────────────────────────────────────────
//  9. TRIAL LOOP
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
  return async function () { return Scheduler.Event.NEXT; };
}


// ─────────────────────────────────────────────
//  10. PER-TRIAL ROUTINE
// ─────────────────────────────────────────────

let _trialPhase, _phaseStartT, _phaseDuration, _trialClock;
let _currentTrial, _currentInfoType, _currentLabelText, _currentQOrder;
let _qIdx, _qSelectedCircle, _qResponseGiven, _qStartT, _interQFixDuration;
let _trialResults;

// Helpers to show/hide all scale elements at once
function scaleSetAutoDraw(val) {
  scale_circles.forEach(c => c.setAutoDraw(val));
  scale_numbers.forEach(n => n.setAutoDraw(val));
  scale_leftDesc.setAutoDraw(val);
  scale_rightDesc.setAutoDraw(val);
}

function allStimOff() {
  [fixStim, productStim, infoStim, labelStim, questionStim].forEach(s => s.setAutoDraw(false));
  scaleSetAutoDraw(false);
}

// Redraw circle fills to match current selection.
// Mirrors Python LikertScale.draw():
//   c.fillColor = "red" if self.current == i else None
function updateCircleFills(selectedIdx) {
  scale_circles.forEach((c, i) => {
    c.setFillColor(i === selectedIdx ? _colRed : _colClear);
  });
}


function trialRoutineBegin(tIdx) {
  return async function () {

    trialIndex       = tIdx + 1;
    _currentTrial    = trialRows[tIdx];
    _currentInfoType = infoAssignment[tIdx];

    // Start loading NEXT trial immediately
    const nextIdx = tIdx + 1;

    if (nextIdx < trialRows.length) {
      prefetchTrialImages(nextIdx);
    }
    _trialClock      = new util.Clock();
    _trialResults    = {};

    const peerName = _currentInfoType === 'peer'
      ? peerNames[Math.floor(Math.random() * peerNames.length)]
      : null;

    const expertLabel = _currentInfoType === 'expert'
      ? (expertMap[normStr(_currentTrial.product_ENG)] || null)
      : null;

    _currentLabelText = resolveLabel(
      _currentInfoType,
      peerName,
      expertLabel
    );

    if (_currentInfoType === 'gpt') {
      _currentQOrder = [...qOrdersGPT[gptCounter % qOrdersGPT.length]];
      gptCounter++;
    } else {
      _currentQOrder = [...qOrdersOther[otherCounter % qOrdersOther.length]];
      otherCounter++;
    }

    _qIdx = 0;

    productStim.setImage(
      `stim/01_product/${_currentTrial.product_ENG}.png`
    );

    infoStim.setImage(
      `stim/02_information/${_currentTrial.product_ENG}_${INFO_CODE_MAP[_currentInfoType]}.png`
    );

    psychoJS.experiment.addData('TrialNumber',    trialIndex);
    psychoJS.experiment.addData('product_ENG',    _currentTrial.product_ENG);
    psychoJS.experiment.addData('product_KOR',    _currentTrial.product_KOR);
    psychoJS.experiment.addData('genre',          _currentTrial.genre);
    psychoJS.experiment.addData('classification', _currentTrial.classification);
    psychoJS.experiment.addData('price_range',    _currentTrial.price_range);
    psychoJS.experiment.addData('InfoType',       _currentInfoType);
    psychoJS.experiment.addData('Q_Order',        _currentQOrder.join('-'));
    psychoJS.experiment.addData('LabelText',      _currentLabelText || '');

    allStimOff();

    _phaseStartT = 0;
    _phaseDuration = CFG.product_dur;
    _trialPhase = 'product';

    productStim.setAutoDraw(true);

    psychoJS.experiment.addData('product.started', 0);

    return Scheduler.Event.NEXT;
  };
}


function trialRoutineEachFrame(tIdx) {
  return async function () {
    t = _trialClock.getTime();

    if (psychoJS.experiment.experimentEnded ||
        psychoJS.eventManager.getKeys({ keyList: ['escape'] }).length > 0)
      return quitPsychoJS('Escape pressed', false);

    // ── product ───────────────────────────────────────────────────────────────
    if (_trialPhase === 'product') {
      if (t >= _phaseStartT + _phaseDuration) {
        productStim.setAutoDraw(false);
        psychoJS.experiment.addData('product.stopped', t);
        _phaseStartT = t;
        _phaseDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
        _trialPhase = 'fix1'; fixStim.setAutoDraw(true);
        psychoJS.experiment.addData('fix1.started', _phaseStartT);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── fix1 ──────────────────────────────────────────────────────────────────
    if (_trialPhase === 'fix1') {
      if (t >= _phaseStartT + _phaseDuration) {

        fixStim.setAutoDraw(false);
        psychoJS.experiment.addData('fix1.stopped', t);

       _phaseStartT = t;
        _phaseDuration = CFG.info_dur;
       _trialPhase = 'info';

       if (_currentLabelText) {
         labelStim.setText(_currentLabelText);
          labelStim.setAutoDraw(true);
       }

       infoStim.setAutoDraw(true);

       psychoJS.experiment.addData('info.started', _phaseStartT);

       psychoJS.experiment.addData(
         'info.fname',
         `stim/02_information/${_currentTrial.product_ENG}_${INFO_CODE_MAP[_currentInfoType]}.png`
       );
  }

  return Scheduler.Event.FLIP_REPEAT;
}

    // ── info ──────────────────────────────────────────────────────────────────
    if (_trialPhase === 'info') {
      if (t >= _phaseStartT + _phaseDuration) {
        infoStim.setAutoDraw(false); labelStim.setAutoDraw(false);
        psychoJS.experiment.addData('info.stopped', t);
        _phaseStartT = t;
        _phaseDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
        _trialPhase = 'fix2'; fixStim.setAutoDraw(true);
        psychoJS.experiment.addData('fix2.started', _phaseStartT);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── fix2 ──────────────────────────────────────────────────────────────────
    if (_trialPhase === 'fix2') {
      if (t >= _phaseStartT + _phaseDuration) {
        fixStim.setAutoDraw(false);
        psychoJS.experiment.addData('fix2.stopped', t);
        _trialPhase = 'question_init';
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── question_init ─────────────────────────────────────────────────────────
    if (_trialPhase === 'question_init') {
      if (_qIdx >= _currentQOrder.length) { _trialPhase = 'done'; return Scheduler.Event.NEXT; }

      const qKey = _currentQOrder[_qIdx];
      const qDef = QUESTION_DEFS[qKey];

      // Show question image, then scale on top of it
      questionStim.setImage(qDef.img);
      questionStim.setAutoDraw(true);

      scale_leftDesc.setText(qDef.left);
      scale_rightDesc.setText(qDef.right);
      if (_currentLabelText) { labelStim.setText(_currentLabelText); labelStim.setAutoDraw(true); }

      // Reset all circles to transparent (no fill), then draw
      _qSelectedCircle = null;
      updateCircleFills(null);
      scaleSetAutoDraw(true);

      _qResponseGiven = false;
      _qStartT = t;
      // Clear any queued key events before starting this question.
      // We use eventManager.getKeys() for input (no Keyboard component)
      // so we flush the event queue manually here.
      psychoJS.eventManager.clearEvents({ eventType: 'keyboard' });

      _trialPhase = 'question';
      psychoJS.experiment.addData(`${qKey}.started`, _qStartT);
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── question ──────────────────────────────────────────────────────────────
    // Arrow key input via psychoJS.eventManager.getKeys() – the same underlying
    // API that Python's event.getKeys() maps to.  No Keyboard component needed;
    // this avoids all waitForStart / callOnFlip timing complexity.
    if (_trialPhase === 'question') {
      const qKey = _currentQOrder[_qIdx];
      const n    = CFG.scale_n;

      // getKeys returns an array of {name, rt, ...} objects for keys pressed
      // since the last call (events are consumed, so no re-firing).
      const pressed = psychoJS.eventManager.getKeys({
        keyList: ['left', 'right', 'return', 'escape'],
      });

      for (const k of pressed) {
        if (k === 'escape' || k.name === 'escape')
          return quitPsychoJS('Escape pressed', false);

        const name = k.name || k;   // getKeys may return strings or objects

        if (name === 'left') {
          // Mirrors Python: first press jumps to middle (n//2 = index 3 for n=7)
          _qSelectedCircle = (_qSelectedCircle === null)
            ? Math.floor(n / 2) : Math.max(0, _qSelectedCircle - 1);
        } else if (name === 'right') {
          _qSelectedCircle = (_qSelectedCircle === null)
            ? Math.floor(n / 2) : Math.min(n - 1, _qSelectedCircle + 1);
        } else if (name === 'return' && _qSelectedCircle !== null) {
          const score = _qSelectedCircle + 1;   // 1-based, matching Python
          const rt = t - _qStartT;
          _trialResults[qKey] = { score, rt };
          psychoJS.experiment.addData(CSV_NAME_MAP[qKey], score);
          psychoJS.experiment.addData(`${CSV_NAME_MAP[qKey]}_RT`, rt);
          psychoJS.experiment.addData(`${qKey}.stopped`, t);
          _qResponseGiven = true;
        }
      }

      // Redraw circles to reflect current selection (red = selected, clear = not)
      updateCircleFills(_qSelectedCircle);

      if (_qResponseGiven) {
        questionStim.setAutoDraw(false);
        labelStim.setAutoDraw(false);
        scaleSetAutoDraw(false);

        _qIdx++;
        _interQFixDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
        _phaseStartT = t; _trialPhase = 'interQ_fix';
        fixStim.setAutoDraw(true);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── interQ_fix ────────────────────────────────────────────────────────────
    if (_trialPhase === 'interQ_fix') {
      if (t >= _phaseStartT + _interQFixDuration) {
        fixStim.setAutoDraw(false);
        _trialPhase = 'question_init';
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // ── done ──────────────────────────────────────────────────────────────────
    return Scheduler.Event.NEXT;
  };
}


function trialRoutineEnd(tIdx) {
  return async function () {

    // Keep fixation visible while next trial loads
    allStimOff();
    fixStim.setAutoDraw(true);

    // Pad unanswered questions with empty strings for clean CSV columns
    ALL_Q_KEYS.forEach(q => {
      if (!_trialResults[q]) {
        psychoJS.experiment.addData(CSV_NAME_MAP[q], '');
        psychoJS.experiment.addData(`${CSV_NAME_MAP[q]}_RT`, '');
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
import { core, data, util, visual } from './lib/psychojs-2026.1.3.js';
const { PsychoJS } = core;
const { TrialHandler } = data;
const { Scheduler } = util;

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const CFG = {
  product_dur:            4.0,    // secs that the product is shown 
  info_dur:               9.0,    // secs that the endorsement is shown
  fix_min:                0.5,    // fixation jitter range
  fix_max:                1.5,

  // randomization parameters 
  max_run:                2,      // max consecutive: same condition
  question_order_max_run: 3,      // max consecutive: same question appearing in the same position

  bg_color:               'black',

  // text 
  font:                   'NanumGothic',
  text_height_big:        0.06,     // endorsement source label 
  text_height_medium:     0.04,     // Likert scale numbers 
  text_height_small:      0.04,     // Likert endpoint descriptions 
  text_bold:              true,
  text_color:             'white',

  // Likert scale 
  scale_n:                7,        // number of scale points 
  circle_radius:          0.045,    // radius of each circle
  scale_y:               -0.15,     // vertical centre of circles
  numbers_y:             -0.265,    // pos. of Likert scale numbers 
  desc_y:                -0.33,     // pos. of Likert endpoint descriptions
  scale_x_left:          -0.42,     // pos. of leftmost circle 
  scale_x_right:          0.42,     // pos. of rightmost circle 

  // endorser label location
  label_x:               -0.45,   
  label_y:                0.35,
};

const INFO_CODE_MAP = {
  expert:    '01',                  // dictionary 
  consensus: '02',
  peer:      '03',
  gpt:       '04',
};

const INFO_LABEL_MAP = {  
  // expert is handled separately    // dictionary for information source label
  consensus: '[소비자 의견 종합]',  
  // peer is handled separately 
  gpt:       '[ChatGPT]',
};

// dictionaries for: Likert scale labels per question   
const QUESTION_DEFS = {
  credEX:     { img: 'stim/03_question/credibility_EX.png',      left: '전혀 전문적이지 않다', right: '매우 전문적이다' },
  credCON:    { img: 'stim/03_question/credibility_CON.png',     left: '전혀 반영하지 않는다', right: '매우 반영한다'  },
  credPEER:   { img: 'stim/03_question/credibility_PEER.png',    left: '전혀 가깝지 않다',     right: '매우 가깝다'    },
  credGen:    { img: 'stim/03_question/credibility_general.png', left: '전혀 믿지 않음',       right: '매우 신뢰함'    },
  preference: { img: 'stim/03_question/preference.png',          left: '전혀 선호하지 않음',   right: '매우 선호함'    },
};

// questions shown per endorser type:
const GPT_QUESTIONS   = ['credEX', 'credCON', 'credPEER', 'credGen', 'preference']; //GPT = all 4 credibility Qs & preference 
const OTHER_QUESTIONS = ['credGen', 'preference'];  //human endorsers = credibilityGeneral & preference

//  all question options and column names, listed for CSV creation later
const ALL_Q_KEYS      = ['credEX', 'credCON', 'credPEER', 'credGen', 'preference'];
const CSV_NAME_MAP = {
  credEX:     'credExpert',
  credCON:    'credConsensus',
  credPEER:   'credPeer',
  credGen:    'credGeneral',
  preference: 'Preference',
};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

//  normalize a string
function normStr(s) { return String(s).trim().toLowerCase().replace(/\s+/g, ' '); }

// validate randomized info order (also accounts for is_valid_order)
function isValidRun(seq, maxRun) {
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === seq[i - 1]) { if (++run > maxRun) return false; }
    else run = 1;
  }
  return true;
}

// JS only: replaces Python function random.shuffle())
function randomPyShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// JS only: replaces Python function itertools.permutations()
function iterPyPermutations(arr) {
  if (arr.length <= 1) return [[...arr]];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of iterPyPermutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

// shuffle rows (also accounts for constrained_shuffle_1d)
function constrainedShuffle(rows, keyFn, maxRun = 2, maxTries = 20000) {
  rows = [...rows];
  for (let attempt = 0; attempt < maxTries; attempt++) {
    randomPyShuffle(rows);
    if (isValidRun(rows.map(keyFn), maxRun)) return rows;
  }
  console.warn('constrainedShuffle: returning last attempt');
  return rows;
}

// makes sure no more than "max_run" consecutive trials get the same endorser type 
function assignInfoTypesBalanced(rows, infoTypes, maxRun = 2, maxTries = 5000) {
  const combo = r => `${r.genre}|${r.classification}|${r.price_range}`;
  const n = rows.length, combos = rows.map(combo);

  // targets: overall each info appears ~info_types.length
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const overall = {}, perCombo = {}, assigned = [];
    let ok = true;
    
    for (let i = 0; i < n; i++) {
      const ck = combos[i];
      // candidate types filtered by run rule
      let candidates = [...infoTypes];
      if (assigned.length >= maxRun &&
          // last max_run are identical -> can't choose that same type again
          assigned.slice(-maxRun).every(x => x === assigned[assigned.length - 1]))
        candidates = candidates.filter(t => t !== assigned[assigned.length - 1]);
      if (!candidates.length) { ok = false; break; }
      if (!perCombo[ck]) perCombo[ck] = {};

      // score candidates: prefer the ones with smallest per-combo count, then smallest overall count
      // randomness to break ties 
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

// check whether adding "candidate" to the question order will violate the max position run constraint
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

// build a sequence of "n_trials" question orders, drawn from "all_orders"
//   called twice in main(): 
//       once for GPT_QUESTIONS (120 permutations of 5 questions)
//       once for OTHER_QUESTIONS (2 permutations of 2 questions)
function buildBalancedQuestionOrders(allOrders, nTrials, maxRun = 3, maxTries = 5000) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    let pool = [];
    while (pool.length < nTrials) {
      const chunk = [...allOrders]; randomPyShuffle(chunk); pool.push(...chunk);
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
  throw new Error('buildBalancedQuestionOrders: could not satisfy constraints');
}

// returns string for the endorser label
function resolveLabel(infoType, peerName, expertLabel) {
  if (infoType === 'peer')   return peerName    ? `[${peerName}의 추천]` : null;
  if (infoType === 'expert') return expertLabel || null;
  return INFO_LABEL_MAP[infoType] || null;    // consensus, GPT, or None 
}

// JS only: replaces Python function numpy.linspace()
function numPyLinspace(start, stop, num) {
  if (num === 1) return [start];
  const step = (stop - start) / (num - 1);
  return Array.from({ length: num }, (_, i) => start + i * step);
}

// JS only: returns the product and info images for a given trial 
function trialResources(trial, infoType) {
  const prod = `stim/01_product/${trial.product_ENG}.png`;
  const info = `stim/02_information/${trial.product_ENG}_${INFO_CODE_MAP[infoType]}.png`;
  return [{ name: prod, path: prod }, { name: info, path: info }];
}

// ─────────────────────────────────────────────
//  PSYCHOJS BOOTSTRAP
// ─────────────────────────────────────────────

// creates the PsychoJS interface (equivalent of PsychoPy imports)
const psychoJS = new PsychoJS({});

// participant input fields 
const expInfo = {
  '참가자 ID': '',
  '친구 이름 1': '',
  '친구 이름 2': '',
  '친구 이름 3': '',
  '친구 이름 4': '',
};

// opens the window (equivalent to Python make_window())
psychoJS.openWindow({
  fullscr:         true,
  color:           new util.Color(CFG.bg_color),
  units:           'height',
  waitBlanking:    true,
  backgroundImage: '',
  backgroundFit:   'none',
});

// show the participant info dialog (equivalent to Python gui.DlgFromDict())
psychoJS.schedule(psychoJS.gui.DlgFromDict({
  dictionary: expInfo,
  title:      '연구 참여 정보 입력',
}));

// JS only: schedulers for normal flow and cancelled dialog flow
const flowScheduler         = new Scheduler(psychoJS);
const dialogCancelScheduler = new Scheduler(psychoJS);



// JS only: OK for running experiment, Cancel for quitting experiment 
psychoJS.scheduleCondition(
  function checkDialogAndProceed() {
    if (!psychoJS.gui.dialogComponent) return false;
      console.log('dialogComponent:', JSON.stringify({
      button: psychoJS.gui.dialogComponent.button,
      status: psychoJS.gui.dialogComponent.status,
      keys: Object.keys(psychoJS.gui.dialogComponent),
    }));

    if (psychoJS.gui.dialogComponent.button !== 'OK') return false;

    const allFilled = Object.values(expInfo).every(v => String(v).trim() !== '');
    if (!allFilled) {
      alert('모든 항목을 입력해 주세요.\n(Please fill in all fields before continuing.)');
      psychoJS.gui.dialogComponent.button = undefined;
      psychoJS.schedule(psychoJS.gui.DlgFromDict({
        dictionary: expInfo,
        title:      '연구 참여 정보 입력',
      }));
      psychoJS.scheduleCondition(checkDialogAndProceed, flowScheduler, dialogCancelScheduler);
      return false;
    }
    return true;
  },
  flowScheduler,
  dialogCancelScheduler,
);

// JS only: queue all routines in order (equivalent to Python main())
flowScheduler.add(updateInfo);                
flowScheduler.add(experimentInit);             
flowScheduler.add(introRoutineBegin());
flowScheduler.add(introRoutineEachFrame());
flowScheduler.add(introRoutineEnd());
flowScheduler.add(infoPagesRoutineBegin());
flowScheduler.add(infoPagesRoutineEachFrame());
flowScheduler.add(infoPagesRoutineEnd());
flowScheduler.add(introFixRoutineBegin());
flowScheduler.add(introFixRoutineEachFrame());
flowScheduler.add(introFixRoutineEnd());

const trialsLoopScheduler = new Scheduler(psychoJS);    // creates and populates trialLoopScheduler
flowScheduler.add(trialsLoopBegin(trialsLoopScheduler));
flowScheduler.add(trialsLoopScheduler);
flowScheduler.add(trialsLoopEnd());
flowScheduler.add(finalRoutineBegin());                 // end of experiment screen 
flowScheduler.add(finalRoutineEachFrame());
flowScheduler.add(finalRoutineEnd());

flowScheduler.add(quitPsychoJS, '', true);              // save data and close experiment 
dialogCancelScheduler.add(quitPsychoJS, '', false);

// JS only: register static resources that must be preloaded before the start of the study 
psychoJS.start({
  expName: 'Endorsement Study',
  expInfo,
  resources: [
    { name: 'product_list.csv',                         path: 'product_list.csv'                         },
    { name: 'expert_labels.csv',                        path: 'expert_labels.csv'                        },
    { name: 'stim/00_fixation/fixation.png',            path: 'stim/00_fixation/fixation.png'            },
    { name: 'stim/04_intro/intro.png',                  path: 'stim/04_intro/intro.png'                    },
    { name: 'stim/04_intro/info_1.png',                 path: 'stim/04_intro/info_1.png'                 },
    { name: 'stim/04_intro/info_2.png',                 path: 'stim/04_intro/info_2.png'                },
    { name: 'stim/04_intro/pause.png',                  path: 'stim/04_intro/pause.png'                  },
    { name: 'stim/03_question/credibility_EX.png',      path: 'stim/03_question/credibility_EX.png'      },
    { name: 'stim/03_question/credibility_CON.png',     path: 'stim/03_question/credibility_CON.png'     },
    { name: 'stim/03_question/credibility_PEER.png',    path: 'stim/03_question/credibility_PEER.png'    },
    { name: 'stim/03_question/credibility_general.png', path: 'stim/03_question/credibility_general.png' },
    { name: 'stim/03_question/preference.png',          path: 'stim/03_question/preference.png'          },
    {  name: 'stim/04_intro/final.png',                 path: 'stim/04_intro/final.png'                  },
    { name: 'default.png', path: 'https://pavlovia.org/assets/default/default.png' },
  ],
});

psychoJS.experimentLogger.setLevel(core.Logger.ServerLevel.EXP);

// ─────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────

// module-level let statements 
// similar to Python's global keyword 
let globalClock, routineTimer, currentLoop, frameDur;   // clocks and loop reference 
let introClock, introStim, introKey, introFixClock, titleLabelStim;     // intro-specific clocks and stim
let infoPagesClock, infoPageStim, infoLabelStim, infoPageWarnStim; // info pages
let infoPagesKey; 
let fixStim, productStim, infoStim, labelStim, questionStim;    // shared stimuli reused every trial 
let pauseStim;          // pause screen image (stim/04_intro/pause.png)
let _escPending = false; // true while pause screen is visible
let scale_circles = [], scale_numbers = [];     // Likert scale visual components 
let scale_leftDesc = null, scale_rightDesc = null;

// trial data and assignment arrays 
let trialRows = [], infoAssignment = [], qOrdersGPT = [], qOrdersOther = [];
let expertMap = {}, peerNames = [];
let gptCounter = 0, otherCounter = 0, trialIndex = 0;

// colors for Likert circle fill
let _colRed, _colClear;

// ─────────────────────────────────────────────
//  updateInfo
// ─────────────────────────────────────────────

// JS only: first scheduled function
// equivalent to the start of Python main()
async function updateInfo() {
  currentLoop = psychoJS.experiment;

  // remap Korean dialog keys for English CSV column titles 
  const englishData = {
    'Participant ID': expInfo['참가자 ID'],
    'Peer 1':         expInfo['친구 이름 1'],
    'Peer 2':         expInfo['친구 이름 2'],
    'Peer 3':         expInfo['친구 이름 3'],
    'Peer 4':         expInfo['친구 이름 4'],
  };

  // overwrite expInfo with the English keys 
  Object.assign(expInfo, englishData);

  // remove the Korean keys so they don't appear in the CSV
  delete expInfo['참가자 ID'];
  delete expInfo['친구 이름 1'];
  delete expInfo['친구 이름 2'];
  delete expInfo['친구 이름 3'];
  delete expInfo['친구 이름 4'];

  // session metadata 
  expInfo['date']            = util.MonotonicClock.getDateStr();
  expInfo['frameRate']       = psychoJS.window.getActualFrameRate();
  frameDur = (typeof expInfo['frameRate'] !== 'undefined')
    ? 1.0 / Math.round(expInfo['frameRate']) : 1.0 / 60.0;
  util.addInfoFromUrl(expInfo);

  // set output CSV filename (equivalent to Python function out_dir)
  psychoJS.experiment.dataFileName =
    `data/${expInfo['Participant ID']}_GPTProj_${expInfo['date']}`;
  return Scheduler.Event.NEXT;
}

// ─────────────────────────────────────────────
//  experimentInit
// ─────────────────────────────────────────────

// JS only: second scheduled function
// builds stimuli, loads data, runs randomization 
async function experimentInit() {
  const win = psychoJS.window;

  // JS only: hide mouse cursor
  document.body.style.cursor = 'none';
  psychoJS.window._renderer.view.style.cursor = 'none';
  
  // initialise clocks (equivalent to Python's global_clock = core.Clock())
  introClock    = new util.Clock();
  introFixClock = new util.Clock();
  globalClock   = new util.Clock();
  routineTimer  = new util.CountdownTimer();

  // validate ID and peer names, use warnings instead of quitting 
  const ID = String(expInfo['Participant ID']).trim();
  peerNames = [1,2,3,4].map(i => String(expInfo[`Peer ${i}`]).trim());
  if (!ID)                           console.warn('Participant ID is empty.');
  if (peerNames.some(n => n === '')) console.warn('A peer name field is empty.');

  // color constants (in JS, they must be built after PsychoJS window)
  _colRed   = new util.Color('red');
  _colClear = new util.Color(CFG.bg_color);

  // JS only: all stimuli are created once here and reused per trial 
  introStim = new visual.ImageStim({
    win, name: 'introStim',
    image: 'stim/04_intro/intro.png',
    pos: [0, 0], units: 'height', anchor: 'center',
  });
  // intro requires Keyboard component, trials use eventManager 
  introKey = new core.Keyboard({ psychoJS, clock: new util.Clock(), waitForStart: true });

  // info pages stimuli (shown after intro screen, before experiment begins)
  infoPagesClock = new util.Clock();
  infoPageStim = new visual.ImageStim({
    win, name: 'infoPageStim',
    image: 'stim/04_intro/info_1.png',
    pos: [0, 0], units: 'height', anchor: 'center',
  });

  // helper: create a text stim in the label style (same as source labels)
  const makeLabelStim = (name, text, pos, depth = -1, wrapWidth = undefined) => new visual.TextStim({
    win, name,
    text, pos,
    height:      CFG.text_height_big,
    color:       new util.Color(CFG.text_color),
    font:        CFG.font,
    bold:        CFG.text_bold,
    alignText:   'left',
    anchor:      'left',
    units:       'height',
    wrapWidth:   wrapWidth,
    depth:        -1,
  });

  // top-left label: "실험 소개"
  titleLabelStim    = makeLabelStim('titleLabelStim',    '실험 소개',
    [CFG.label_x, CFG.label_y]);
  // second label: shown only on info pages 
  infoLabelStim = makeLabelStim('infoLabelStim', '본 실험에는 4명의 정보원이 등장합니다.',
    [CFG.label_x, CFG.label_y], -1, 1.0);
 
  // warning text shown when participant tries to proceed too early
  infoPageWarnStim = new visual.TextStim({
    win, name: 'infoPageWarnStim',
    text:        '내용을 읽어주세요!',
    pos:         [0, -0.4],
    height:      CFG.text_height_big,
    color:       new util.Color('yellow'),
    font:        CFG.font,
    bold:        CFG.text_bold,
    alignText:   'center',
    anchorHoriz: 'center',
    units:       'height',
    wrapWidth:   undefined,
    depth:       -2,
  });
  infoPagesKey = new core.Keyboard({ psychoJS, clock: new util.Clock(), waitForStart: true });

  fixStim = new visual.ImageStim({
    win, name: 'fixStim',
    image: 'stim/00_fixation/fixation.png',
    pos: [0, 0], units: 'height', anchor: 'center',
  });

  // initialized with placeholder, real images are set per-trial (productStim.setImage())
  productStim = new visual.ImageStim({
    win, name: 'productStim',
    image: 'default.png',
    pos: [0, 0], units: 'height', anchor: 'center',
  });

  // initialized with placeholder, real images are set per-trial (infoStim.setImage())
  infoStim = new visual.ImageStim({
    win, name: 'infoStim',
    image: 'default.png',
    pos: [0, 0], units: 'height', anchor: 'center',
  });

  // info source label (equivalent to Python function make_info_label())
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
    depth:       -1,        // draws in front of infoStim & questionStim (depth:0) 
  });

  // question background png 
  questionStim = new visual.ImageStim({
    win, name: 'questionStim',
    image: 'stim/03_question/credibility_general.png',
    pos: [0, 0], units: 'height', anchor: 'center',
    depth: 0,
  });

  // pause screen image shown when fullscreen is interrupted
  pauseStim = new visual.ImageStim({
    win, name: 'pauseStim',
    image: 'stim/04_intro/pause.png',
    pos: [0, 0], units: 'height', anchor: 'center',
    depth: -2,    // in front of all trial stims
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement &&
        !_escPending &&
        psychoJS.experiment &&
        !psychoJS.experiment.experimentEnded) {
      _escPending = true;
      allStimOff();
      pauseStim.setAutoDraw(true);
    }
  });

  // Likert scale (equivalent to Python class LikertScale)
  const xs       = numPyLinspace(CFG.scale_x_left, CFG.scale_x_right, CFG.scale_n);
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

  // endpoint description labels, text is swapped per-question
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

  // manually fetch and parse expert_labels.csv (no header row) 
  try {
    const raw = await (await fetch('expert_labels.csv')).text();
    raw.trim().split('\n').forEach(line => {
      const parts = line.split(',');
      if (parts.length >= 2)
        expertMap[normStr(parts[0])] = parts.slice(1).join(',').trim();
    });
  } catch (e) { console.warn('expert_labels.csv fetch failed:', e); }

  // manually fetch and parse product_list.csv (csv instead of Python and excel)
  const _productHandler = new TrialHandler({
    psychoJS, nReps: 1,
    method: TrialHandler.Method.SEQUENTIAL,
    trialList: 'product_list.csv',
    name: '_productLoader',
  });
  const productRows = _productHandler.trialList;
  if (!productRows || productRows.length === 0)
    throw new Error('product_list.csv loaded 0 rows.');

  // validate required columns (equivalent to Python missing_cols check)
  const reqCols     = ['product_ENG', 'product_KOR', 'genre', 'classification', 'price_range'];
  const missingCols = reqCols.filter(c => !(c in productRows[0]));
   // error for missing products 
  if (missingCols.length) throw new Error(`product_list.csv missing: ${missingCols}`);
  // warning for missing expert labels  
  const missingExperts = productRows
    .filter(r => !(normStr(r.product_ENG) in expertMap)).map(r => r.product_ENG);
  if (missingExperts.length) console.warn('No expert label for:', missingExperts);

  // shuffle & assign info types, build question order pools  
  trialRows = constrainedShuffle(
    productRows, r => `${r.genre}|${r.classification}|${r.price_range}`, CFG.max_run
  );
  const nTrials  = trialRows.length;
  const infoTypes = Object.keys(INFO_CODE_MAP);
  infoAssignment = assignInfoTypesBalanced(trialRows, infoTypes, CFG.max_run);

  qOrdersGPT   = buildBalancedQuestionOrders(iterPyPermutations(GPT_QUESTIONS),   nTrials, CFG.question_order_max_run);
  qOrdersOther = buildBalancedQuestionOrders(iterPyPermutations(OTHER_QUESTIONS), nTrials, CFG.question_order_max_run);
  gptCounter = 0; otherCounter = 0; trialIndex = 0;

  // JS only: prefetch the images for the first trial 
  if (nTrials > 0) await prefetchTrialImages(0);
  return Scheduler.Event.NEXT;
}

// ─────────────────────────────────────────────
//  IMAGE LOAD HELPER
// ─────────────────────────────────────────────

// unlike in Python, PsychoJS requires all images to be registered before use 
//    this is a workaround so that the participant does not need to wait to load 
//    300+ images in the browser: it loads the next trial's images, one trial ahead. 
const _fetchedTrials = new Set();

// registeres product and info images for trial tIdx with PsychoJS 
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
//  INTRO ROUTINE
// ─────────────────────────────────────────────

// JS requires routine to be split into Begin/EachFrame/End 
//    (equivalent to Python function show_intro()) 
let introComponents;
var t, continueRoutine;

function introRoutineBegin() {
  return async function () {
    t = 0; introClock.reset(); continueRoutine = true;
    introKey.keys = undefined; introKey.rt = undefined; introKey._allKeys = [];
    introComponents = [introStim, introKey];
    for (const c of introComponents) if ('status' in c) c.status = PsychoJS.Status.NOT_STARTED;
    return Scheduler.Event.NEXT;
  };
}

function introRoutineEachFrame() {
  return async function () {
    t = introClock.getTime();

    // while paused (fullscreen exited): wait for Y (quit) or N (resume)
    if (_escPending) {
      const confirm = psychoJS.eventManager.getKeys({ keyList: ['y', 'n'] });
      for (const k of confirm) {
        const name = k.name || k;
        if (name === 'y') return quitPsychoJS('사용자 종료', false);
        if (name === 'n') {
          pauseStim.setAutoDraw(false);
          introStim.setAutoDraw(true);
          titleLabelStim.setAutoDraw(true);
          if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
          _escPending = false;
        }
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    if (t >= 0 && introStim.status === PsychoJS.Status.NOT_STARTED) {
      introStim.tStart = t; introStim.status = PsychoJS.Status.STARTED;
      introStim.setAutoDraw(true);
      titleLabelStim.setAutoDraw(true);
    }

    // JS only: callOnFlip delays keyboard start (equivalent to Python function checked_wait())
    if (t >= 0 && introKey.status === PsychoJS.Status.NOT_STARTED) {
      introKey.tStart = t; introKey.status = PsychoJS.Status.STARTED;
      psychoJS.window.callOnFlip(() => { introKey.clock.reset(); introKey.start(); introKey.clearEvents(); });
    }
    if (introKey.status === PsychoJS.Status.STARTED) {
      // space only: advances to info pages
      const keys = introKey.getKeys({ keyList: ['space'], waitRelease: false });
      introKey._allKeys = introKey._allKeys.concat(keys);
      if (introKey._allKeys.length > 0) continueRoutine = false;
    }
    if (psychoJS.experiment.experimentEnded) return quitPsychoJS('Experiment ended', false);
    if (!continueRoutine) return Scheduler.Event.NEXT;
    return Scheduler.Event.FLIP_REPEAT;
  };
}

function introRoutineEnd() {
  return async function () {
    for (const c of introComponents) if (typeof c.setAutoDraw === 'function') c.setAutoDraw(false);
    titleLabelStim.setAutoDraw(false);
    introKey.stop(); routineTimer.reset();
    return Scheduler.Event.NEXT;
  };
}

// ─────────────────────────────────────────────
//  INFO PAGES ROUTINE
// ─────────────────────────────────────────────

// shown after the intro screen. left/right arrows toggle between screens
// space starts the experiment, only if participant has visited both pages for min. 2 secs

let _infoCurrentPage;        // 1 or 2
let _infoVisited;            // Set of visited page numbers
let _infoAccumTime;          // accumulated dwell time
let _infoPageEnteredAt;      // clock time when current page was entered
let _infoWarnVisible;        // whether warning text is currently showing
let _infoWarnStartT;         // when warning appeared (for auto-hide)
const INFO_MIN_DUR  = 1.5;   // minimum seconds required on each page
const INFO_WARN_DUR = 1.5;   // how long the warning text stays visible

// returns total dwell time on a page (accumulated + current stay)
function _infoDwell(page, now) {
  return _infoAccumTime[page] + (_infoCurrentPage === page ? now - _infoPageEnteredAt : 0);
}

function infoPagesRoutineBegin() {
  return async function () {
    t = 0; infoPagesClock.reset(); continueRoutine = true;

    _infoCurrentPage   = 1;
    _infoVisited       = new Set([1]);
    _infoAccumTime     = { 1: 0, 2: 0 };
    _infoPageEnteredAt = 0;
    _infoWarnVisible   = false;
    _infoWarnStartT    = null;

    infoPageStim.setImage('stim/04_intro/info_1.png');
    infoPageStim.setAutoDraw(true);
    infoLabelStim.setAutoDraw(true);

    infoPagesKey.keys = undefined; infoPagesKey.rt = undefined; infoPagesKey._allKeys = [];
    infoPagesKey.status = PsychoJS.Status.NOT_STARTED;
    psychoJS.window.callOnFlip(() => { infoPagesKey.clock.reset(); infoPagesKey.start(); infoPagesKey.clearEvents(); });

    return Scheduler.Event.NEXT;
  };
}

function infoPagesRoutineEachFrame() {
  return async function () {
    t = infoPagesClock.getTime();

    // while paused (fullscreen exited): wait for Y (quit) or N (resume)
    if (_escPending) {
      const confirm = psychoJS.eventManager.getKeys({ keyList: ['y', 'n'] });
      for (const k of confirm) {
        const name = k.name || k;
        if (name === 'y') return quitPsychoJS('사용자 종료', false);
        if (name === 'n') {
          pauseStim.setAutoDraw(false);
          infoPageStim.setAutoDraw(true);
          infoLabelStim.setAutoDraw(true);
          if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
          _escPending = false;
        }
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    if (infoPagesKey.status === PsychoJS.Status.NOT_STARTED) {
      infoPagesKey.tStart = t; infoPagesKey.status = PsychoJS.Status.STARTED;
    }

    for (const k of infoPagesKey.getKeys({ keyList: ['left', 'right', 'space'], waitRelease: false })) {
      const name = k.name || k;

      if (name === 'left' || name === 'right') {
        // accumulate dwell time on the page we're leaving, then switch
        _infoAccumTime[_infoCurrentPage] += t - _infoPageEnteredAt;
        _infoCurrentPage  = (_infoCurrentPage === 1) ? 2 : 1;
        _infoVisited.add(_infoCurrentPage);
        _infoPageEnteredAt = t;
        infoPageStim.setImage(`stim/04_intro/info_${_infoCurrentPage}.png`);

      } else if (name === 'space') {
        const seenBoth   = _infoVisited.has(1) && _infoVisited.has(2);
        const enoughTime = _infoDwell(1, t) >= INFO_MIN_DUR && _infoDwell(2, t) >= INFO_MIN_DUR;

        if (seenBoth && enoughTime) {
          continueRoutine = false;
        } else if (!_infoWarnVisible) {
          infoPageWarnStim.setAutoDraw(true);
          _infoWarnVisible = true; _infoWarnStartT = t;
        }
      }
    }

    // auto-hide warning
    if (_infoWarnVisible && (t - _infoWarnStartT) >= INFO_WARN_DUR) {
      infoPageWarnStim.setAutoDraw(false); _infoWarnVisible = false;
    }

    if (psychoJS.experiment.experimentEnded) return quitPsychoJS('Experiment ended', false);
    if (!continueRoutine) return Scheduler.Event.NEXT;
    return Scheduler.Event.FLIP_REPEAT;
  };
}

function infoPagesRoutineEnd() {
  return async function () {
    infoPageStim.setAutoDraw(false);
    infoLabelStim.setAutoDraw(false);
    infoPageWarnStim.setAutoDraw(false);
    infoPagesKey.stop(); routineTimer.reset();
    return Scheduler.Event.NEXT;
  };
}

// ─────────────────────────────────────────────
//  FINAL ROUTINE
// ─────────────────────────────────────────────

let finalClock, finalStim;

function finalRoutineBegin() {
  return async function () {
    t = 0;
    finalClock = new util.Clock();
    finalClock.reset();

    if (fixStim) fixStim.setAutoDraw(false);

    finalStim = new visual.ImageStim({
      win: psychoJS.window,
      name: 'finalStim',
      image: 'stim/04_intro/final.png',
      pos: [0, 0], units: 'height', anchor: 'center',
    });
    finalStim.status = PsychoJS.Status.NOT_STARTED;

    return Scheduler.Event.NEXT;
  };
}

function finalRoutineEachFrame() {
  return async function () {
    t = finalClock.getTime();

    if (t >= 0 && finalStim.status === PsychoJS.Status.NOT_STARTED) {
      finalStim.tStart = t;
      finalStim.status = PsychoJS.Status.STARTED;
      finalStim.setAutoDraw(true);
    }
    if (psychoJS.experiment.experimentEnded) return quitPsychoJS('Experiment ended', false);
    // auto-advance after 3.0 seconds — no keypress needed to close screen
    if (t >= 3.0) return Scheduler.Event.NEXT;

    return Scheduler.Event.FLIP_REPEAT;
  };
}

function finalRoutineEnd() {
  return async function () {
    finalStim.setAutoDraw(false);
    return Scheduler.Event.NEXT;
  };
}

// ─────────────────────────────────────────────
//  INITIAL 3-SECOND FIXATION
// ─────────────────────────────────────────────

// (equivalent to Python function show_fixation(win, mindur=3, maxdur=3) after intro)
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
//  TRIAL LOOP
// ─────────────────────────────────────────────

// register Begin/EachFrame/End triplet per trial in loopScheduler
//     (equivalent to Python loop for t_idx, trial in enumerate(trials))
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
//  PER-TRIAL ROUTINE
// ─────────────────────────────────────────────

// per-trial state variables 
let _trialPhase, _phaseStartT, _phaseDuration, _trialClock;
let _currentTrial, _currentInfoType, _currentLabelText, _currentQOrder;
let _qIdx, _qSelectedCircle, _qResponseGiven, _qStartT, _interQFixDuration;
let _trialResults;

// helpers to show/hide all scale elements at once 
//    (equivalent to Python functions LikertScale.draw() / .reset())
function scaleSetAutoDraw(val) {
  scale_circles.forEach(c => c.setAutoDraw(val));
  scale_numbers.forEach(n => n.setAutoDraw(val));
  scale_leftDesc.setAutoDraw(val);
  scale_rightDesc.setAutoDraw(val);
}

// hide all trial stims at once (for trial starts and ends)
function allStimOff() {
  [fixStim, productStim, infoStim, labelStim, questionStim].forEach(s => s.setAutoDraw(false));
  scaleSetAutoDraw(false);
}

// redraw circle fills to match current selection.
//    (equivalent to Python function LikertScale.draw()) 
function updateCircleFills(selectedIdx) {
  scale_circles.forEach((c, i) => {            // fill with red if self.current == i else None
    c.setFillColor(i === selectedIdx ? _colRed : _colClear);
  });
}

// set up state for the new trial, preload next trial's images 
// assign label & question order, queue trial data into CSV 
function trialRoutineBegin(tIdx) {
  return async function () {

    trialIndex       = tIdx + 1;
    _currentTrial    = trialRows[tIdx];
    _currentInfoType = infoAssignment[tIdx];

    // JS only: start loading NEXT trial immediately
    const nextIdx = tIdx + 1;

    if (nextIdx < trialRows.length) {
      prefetchTrialImages(nextIdx);
    }
    _trialClock      = new util.Clock();
    _trialResults    = {};

    // pick random name if peer trial (equivalent to Python function random.choice(peer_names))
    const peerName = _currentInfoType === 'peer'
      ? peerNames[Math.floor(Math.random() * peerNames.length)]
      : null;

    // look up expert label if expert trial (equivalent to Python function expert_label_map.get())
    const expertLabel = _currentInfoType === 'expert'
      ? (expertMap[normStr(_currentTrial.product_ENG)] || null)
      : null;

    _currentLabelText = resolveLabel(
      _currentInfoType,
      peerName,
      expertLabel
    );

    // pick question order from the appropriate balanced pool 
    if (_currentInfoType === 'gpt') {
      _currentQOrder = [...qOrdersGPT[gptCounter % qOrdersGPT.length]];
      gptCounter++;
    } else {
      _currentQOrder = [...qOrdersOther[otherCounter % qOrdersOther.length]];
      otherCounter++;
    }
    _qIdx = 0;

    // swap in trial's product and info images
    productStim.setImage(
      `stim/01_product/${_currentTrial.product_ENG}.png`
    );
    infoStim.setImage(
      `stim/02_information/${_currentTrial.product_ENG}_${INFO_CODE_MAP[_currentInfoType]}.png`
    );

    // write trial data columns into CSV 
    psychoJS.experiment.addData('TrialNumber',    trialIndex);
    psychoJS.experiment.addData('product_ENG',    _currentTrial.product_ENG);
    psychoJS.experiment.addData('product_KOR',    _currentTrial.product_KOR);
    psychoJS.experiment.addData('genre',          _currentTrial.genre);
    psychoJS.experiment.addData('classification', _currentTrial.classification);
    psychoJS.experiment.addData('PriceRange',    _currentTrial.price_range);
    psychoJS.experiment.addData('InfoType',       _currentInfoType);
    psychoJS.experiment.addData('Q_Order',        _currentQOrder.join('-'));
    psychoJS.experiment.addData('LabelText',      _currentLabelText || '');
    allStimOff();

    _phaseStartT = 0;
    _phaseDuration = CFG.product_dur;
    _trialPhase = 'product';
    _escPending = false;   // reset pause state for every new trial

    productStim.setAutoDraw(true);
    psychoJS.experiment.addData('product.started', 0);
    return Scheduler.Event.NEXT;
  };
}

// drives the full trial sequence 
//    product -> fix1 -> info -> fix2 -> [question -> interQ_fix] x N 
//    (equivalent to Python's calls for show_image_timed() / show_fixation() / run_question())
function trialRoutineEachFrame(tIdx) {
  return async function () {
    t = _trialClock.getTime();

    if (psychoJS.experiment.experimentEnded)
      return quitPsychoJS('Experiment ended', false);

    // while paused: wait for Y (quit) or N (resume)
    if (_escPending) {
      const confirm = psychoJS.eventManager.getKeys({ keyList: ['y', 'n'] });
      for (const k of confirm) {
        const name = k.name || k;
        if (name === 'y') return quitPsychoJS('사용자 종료', false);
        if (name === 'n') {
          pauseStim.setAutoDraw(false);
          allStimOff();
          _trialClock.reset();
          _phaseStartT     = 0;
          _phaseDuration   = CFG.product_dur;
          _trialPhase      = 'product';
          _qIdx            = 0;
          _qSelectedCircle = null;
          _trialResults    = {};
          psychoJS.experiment.addData('product.restarted', 1);
          productStim.setAutoDraw(true);
          if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
          _escPending = false;
        }
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // product (equivalent to Python function show_image_timed())
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

    // fix1 (equivalent to Python function show_fixation())
    if (_trialPhase === 'fix1') {
      if (t >= _phaseStartT + _phaseDuration) {

        fixStim.setAutoDraw(false);
        psychoJS.experiment.addData('fix1.stopped', t);

       _phaseStartT = t;
        _phaseDuration = CFG.info_dur;
       _trialPhase = 'info';

       // show endorser label if present 
       if (_currentLabelText) {
         labelStim.setText(_currentLabelText);
          labelStim.setAutoDraw(true);
       }
       infoStim.setAutoDraw(true);
       psychoJS.experiment.addData('info.started', _phaseStartT);
  }
  return Scheduler.Event.FLIP_REPEAT;
}

    // info (equivalent to Python function show_image_timed())
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

    // fix2 (equivalent to Python function show_fixation())
    if (_trialPhase === 'fix2') {
      if (t >= _phaseStartT + _phaseDuration) {
        fixStim.setAutoDraw(false);
        psychoJS.experiment.addData('fix2.stopped', t);
        _trialPhase = 'question_init';
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // question_init (equivalent to Python setup for qname in q_order: & show_question()) 
    if (_trialPhase === 'question_init') {
      if (_qIdx >= _currentQOrder.length) { _trialPhase = 'done'; return Scheduler.Event.NEXT; }

      const qKey = _currentQOrder[_qIdx];
      const qDef = QUESTION_DEFS[qKey];

      // show question image, then Likert scale on top of it
      questionStim.setImage(qDef.img);
      questionStim.setAutoDraw(true);

      scale_leftDesc.setText(qDef.left);
      scale_rightDesc.setText(qDef.right);
      if (_currentLabelText) { labelStim.setText(_currentLabelText); labelStim.setAutoDraw(true); }

      // reset all circles to transparent (no fill), then draw
      _qSelectedCircle = null;
      updateCircleFills(null);
      scaleSetAutoDraw(true);

      _qResponseGiven = false;
      _qStartT = t;
      // JS only: clear any queued key events before starting this question.
      psychoJS.eventManager.clearEvents({ eventType: 'keyboard' });

      _trialPhase = 'question';
      return Scheduler.Event.FLIP_REPEAT;
    }

    // question (equivalent to Python loop show_question() / LikertScale.handle_key())
    //     psychoJS.eventManager.getKeys() maps similarly to Python's event.getKeys()
    if (_trialPhase === 'question') {
      const qKey = _currentQOrder[_qIdx];
      const n    = CFG.scale_n;

      const pressed = psychoJS.eventManager.getKeys({
        keyList: ['left', 'right', 'return'],
      });

      for (const k of pressed) {
        const name = k.name || k;
        if (name === 'left') {
          // mirrors Python LikertScale: first press jumps to middle (n//2 = index 3 for n=7)
          _qSelectedCircle = (_qSelectedCircle === null)
            ? Math.floor(n / 2) : Math.max(0, _qSelectedCircle - 1);
        } else if (name === 'right') {
          _qSelectedCircle = (_qSelectedCircle === null)
            ? Math.floor(n / 2) : Math.min(n - 1, _qSelectedCircle + 1);
        } else if (name === 'return' && _qSelectedCircle !== null) {
          const score = _qSelectedCircle + 1;   
          const rt = t - _qStartT;
          _trialResults[qKey] = { score, rt };
          psychoJS.experiment.addData(CSV_NAME_MAP[qKey], score);
          psychoJS.experiment.addData(`${CSV_NAME_MAP[qKey]}_RT`, rt);
          _qResponseGiven = true;
        }
      }

      // redraw circles to reflect current selection 
      updateCircleFills(_qSelectedCircle);
      if (_qResponseGiven) {
        questionStim.setAutoDraw(false);
        labelStim.setAutoDraw(false);
        scaleSetAutoDraw(false);

        // advance to next question with jittered interQ fixation
        _qIdx++;
        _interQFixDuration = CFG.fix_min + Math.random() * (CFG.fix_max - CFG.fix_min);
        _phaseStartT = t; _trialPhase = 'interQ_fix';
        fixStim.setAutoDraw(true);
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // interQ_fix   (equivalent to Python function show_fixation())
    if (_trialPhase === 'interQ_fix') {
      if (t >= _phaseStartT + _interQFixDuration) {
        fixStim.setAutoDraw(false);
        _trialPhase = 'question_init';
      }
      return Scheduler.Event.FLIP_REPEAT;
    }

    // done
    return Scheduler.Event.NEXT;
  };
}

// finalize trial's CSV row and advance to next entry
function trialRoutineEnd(tIdx) {
  return async function () {

    // keep fixation visible while next trial loads
    allStimOff();
    fixStim.setAutoDraw(true);

    // pad unanswered questions with empty strings for clean CSV columns
    ALL_Q_KEYS.forEach(q => {
      if (!_trialResults[q]) {
        psychoJS.experiment.addData(CSV_NAME_MAP[q], '');
        psychoJS.experiment.addData(`${CSV_NAME_MAP[q]}_RT`, '');
      }
    });

    // JS only: start new row in CSV
    psychoJS.experiment.nextEntry();
    return Scheduler.Event.NEXT;
  };
}

// ─────────────────────────────────────────────
//  QUIT
// ─────────────────────────────────────────────

// equivalent to Python block flush_csvs(), win.close(), core.quit() 
async function quitPsychoJS(message, isCompleted) {
  // ensure final row of CSV is written even if experiment ends mid-trial 
  if (psychoJS.experiment.isEntryEmpty()) psychoJS.experiment.nextEntry();

  // JS only: exit browser fullscreen 
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  // JS only: restore cursor visibility 
  document.body.style.cursor = 'auto';  
  psychoJS.window._renderer.view.style.cursor = 'auto';

  psychoJS.window.close();
  psychoJS.quit({ message, isCompleted });
  return Scheduler.Event.QUIT;
}
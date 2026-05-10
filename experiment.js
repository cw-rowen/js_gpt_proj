import { core, data, util, visual } from './lib/psychojs-2024.1.4.js';
const { PsychoJS } = core;
const { TrialHandler } = data;
const { Scheduler } = util;

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIG 
// ─────────────────────────────────────────────────────────────────────────────
const CFG = {
  product_dur : 4.0,
  info_dur    : 9.0,
  fix_min     : 0.5,
  fix_max     : 1.5,
  max_run     : 2,
  question_order_max_run: 3,
  text_color  : 'white',
  font        : 'NanumGothic',
  scale_n        : 7,
  circle_radius  : 0.065, 
  scale_y        : -0.15, 
  numbers_y      : -0.27,
  desc_y         : -0.35,
  label_x        : -0.75,
  label_y        :  0.75,
  scale_x_left   : -0.6,
  scale_x_right  :  0.6,
  text_height_big    : 0.07,
  text_height_medium : 0.045,
  text_height_small  : 0.05,
};

const INFO_TYPES    = ['expert', 'consensus', 'peer', 'gpt'];
const INFO_CODE_MAP = { expert:'01', consensus:'02', peer:'03', gpt:'04' };

const INFO_LABEL_MAP = {
  consensus: '[소비자 의견 종합]',
  gpt      : '[ChatGPT]',
};

// Questions shown per endorser type
const GPT_QUESTIONS   = ['credEX', 'credCON', 'credPEER', 'credGen', 'preference'];
const OTHER_QUESTIONS = ['credGen', 'preference'];

const QUESTION_DEFS = {
  credEX   : { bg:'credibility_EX.png',      left:'전혀 전문적이지 않다', right:'매우 전문적이다' },
  credCON  : { bg:'credibility_CON.png',      left:'전혀 반영하지 않는다', right:'매우 반영한다'  },
  credPEER : { bg:'credibility_PEER.png',     left:'전혀 가깝지 않다',     right:'매우 가깝다'    },
  credGen  : { bg:'credibility_general.png',  left:'전혀 믿지 않음',       right:'매우 신뢰함'    },
  preference:{ bg:'preference.png',           left:'전혀 선호하지 않음',   right:'매우 선호함'    },
};


// Helper to match Python's filename handling
function getProductFilename(name) {
    return `${name.trim()}.png`;
}

function getInfoFilename(name, code) {
    return `${name.trim()}_${code}.png`;
}
function norm(s) {
    return String(s).trim().toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXPERT LABELS (Refreshed from your expert_labels.csv)
// ─────────────────────────────────────────────────────────────────────────────
const EXPERT_LABEL_MAP = {
  'airfryer': '[식품공학 전문가]',
  'bath bomb': '[화장품 성분 전문가]',
  'body lotion': '[피부과 전문의]',
  'body mist': '[향료 전문가]',
  'bread': '[제빵사]',
  'cable organizer': '[제품디자인 전문가]',
  'cake': '[제과 전문가]',
  'canned tuna': '[식품영양 전문가]',
  'caviar': '[식품감별 전문가]',
  'chips': '[식품공정 전문가]',
  'chocolate': '[쇼콜라티에]',
  'cookies': '[제과 연구원]',
  'cup ramen': '[식품안전 전문가]',
  'decorative magnet': '[산업디자인 전문가]',
  'decorative tape': '[시각디자인 전문가]',
  'disposable camera': '[사진기술 전문가]',
  'egronomics chair seat': '[인체공학 전문가]',
  'egyptian cotton sheets set': '[섬유소재 전문가]',
  'electric toothbrush': '[치과 위생 전문가]',
  'fountain pen': '[필기구 전문가]',
  'frozen pizza': '[식품개발 전문가]',
  'gaming console': '[게임공학 전문가]',
  'hair brush': '[모발관리 전문가]',
  'instant coffee maker': '[가전기기 전문가]',
  'instant coffee': '[식품관능 평가사]',
  'laptop stand': '[인체공학 전문가]',
  'leather notebook': '[제품디자인 전문가]',
  'LED mood light': '[조명설계 전문가]',
  'lip balm': '[피부과 전문의]',
  'luxury perfume': '[조향 전문가]',
  'mango set': '[식품품질 전문가]',
  'manuka honey': '[식품영양 전문가]',
  'massaging roller': '[물리치료 전문가]',
  'memo pads': '[문구제품 디자이너]',
  'mini camera': '[광학기기 전문가]',
  'mouse pad': '[산업디자인 전문가]',
  'multitab': '[전기안전 전문가]',
  'oil pastels': '[미술재료 전문가]',
  'organic olive oil': '[식품영양 전문가]',
  'paper weight': '[제품디자인 전문가]',
  'pen': '[필기구 전문가]',
  'portable charger': '[전기전자 전문가]',
  'portable humidifier': '[환경가전 전문가]',
  'projector': '[영상기기 전문가]',
  'rc car': '[완구공학 전문가]',
  'roll-on mini perfume': '[조향 전문가]',
  'scented hand cream': '[피부과 전문의]',
  'scientific calculator': '[수학교육 전문가]',
  'shampoo': '[두피관리 전문가]',
  'singing bowl': '[명상 테라피 전문가]',
  'skin care device': '[피부미용기기 전문가]',
  'SSD external storage': '[컴퓨터공학 전문가]',
  'stamp': '[문구디자인 전문가]',
  'steak 500g': '[식육가공 전문가]',
  'stickers': '[시각디자인 전문가]',
  'supplements': '[영양학 전문가]',
  'tablet': '[IT기기 전문가]',
  'tea gift set': '[차 소믈리에]',
  'vacuum cleaner': '[가전공학 전문가]',
  'VR headset': '[가상현실 전문가]',
  'wax burner': '[조향 분석 전문가]',
  'wax seal kit': '[공예 전문가]',
  'weighted blanket': '[수면과학 전문가]',
  'wireless keyboard': '[인체공학 전문가]'
};


function getExpertLabel(productENG) {
  return EXPERT_LABEL_MAP[norm(productENG)] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PSYCHOJS INIT
// ─────────────────────────────────────────────────────────────────────────────
const psychoJS = new PsychoJS({ debug: false });

psychoJS.start({
  expName : 'EndorsementStudy',
  expInfo : {
    'Participant ID' : '',
    'Peer 1'         : '',
    'Peer 2'         : '',
    'Peer 3'         : '',
    'Peer 4'         : '',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
//  RANDOMISATION HELPERS  (direct ports of the Python functions)
// ─────────────────────────────────────────────────────────────────────────────

/** Fisher-Yates in-place shuffle */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randUniform(min, max) { return min + Math.random() * (max - min); }
function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** Check the whole sequence has no run longer than maxRun */
function isValidRun(seq, maxRun) {
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    run = seq[i] === seq[i - 1] ? run + 1 : 1;
    if (run > maxRun) return false;
  }
  return true;
}

/**
 * Shuffle rows so no more than maxRun consecutive trials share the same
 * (genre, classification, price_range) combination.
 * Mirrors Python constrained_shuffle().
 */
function constrainedShuffle(rows, maxRun, maxTries = 20000) {
  const key = r => `${r.genre}|${r.classification}|${r.price_range}`;
  for (let t = 0; t < maxTries; t++) {
    shuffleArray(rows);
    if (isValidRun(rows.map(key), maxRun)) return rows;
  }
  console.warn('constrainedShuffle: could not satisfy run constraint, using last shuffle');
  return rows;
}

/**
 * Assign one info_type per trial, balanced across combo cells and overall counts,
 * respecting the max consecutive run constraint.
 * Mirrors Python assign_info_types_balanced().
 */
function assignInfoTypes(rows, infoTypes, maxRun, maxTries = 5000) {
  const comboKey = r => `${r.genre}|${r.classification}|${r.price_range}`;

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const overall  = Object.fromEntries(infoTypes.map(t => [t, 0]));
    const perCombo = {};
    const assigned = [];
    let ok = true;

    for (let i = 0; i < rows.length; i++) {
      const ck = comboKey(rows[i]);
      if (!perCombo[ck]) perCombo[ck] = Object.fromEntries(infoTypes.map(t => [t, 0]));

      // enforce consecutive-run constraint
      let candidates = [...infoTypes];
      if (assigned.length >= maxRun) {
        const last = assigned[assigned.length - 1];
        if (assigned.slice(-maxRun).every(x => x === last)) {
          candidates = candidates.filter(t => t !== last);
        }
      }
      if (!candidates.length) { ok = false; break; }

      // score: min per-combo count → min overall count → random tiebreak
      const scored = candidates.map(t => [perCombo[ck][t], overall[t], Math.random(), t]);
      scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      const chosen = scored[0][3];

      assigned.push(chosen);
      overall[chosen]++;
      perCombo[ck][chosen]++;
    }
    if (ok) return assigned;
  }
  throw new Error('assignInfoTypes: could not satisfy constraints');
}

/** All permutations of an array */
function permutations(arr) {
  if (arr.length <= 1) return [[...arr]];
  return arr.flatMap((v, i) =>
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map(p => [v, ...p])
  );
}

/**
 * Whether inserting `candidate` into `history` would violate the position-run constraint.
 * Mirrors Python is_valid_position_runs().
 */
function isValidPositionRuns(history, candidate, maxRun) {
  for (let pos = 0; pos < candidate.length; pos++) {
    let run = 1;
    for (let j = history.length - 1; j >= 0; j--) {
      if (history[j][pos] === candidate[pos]) run++;
      else break;
    }
    if (run > maxRun) return false;
  }
  return true;
}

/**
 * Build a list of nTrials question orderings from allOrders with the
 * position-run constraint. Mirrors Python build_balanced_question_orders().
 */
function buildBalancedQuestionOrders(allOrders, nTrials, maxRun, maxTries = 500) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    // build pool ≥ nTrials
    let pool = [];
    while (pool.length < nTrials) pool = pool.concat(shuffleArray([...allOrders]));
    pool = pool.slice(0, nTrials);

    const arranged = [];
    const remaining = [...pool];

    while (remaining.length > 0) {
      const valid = remaining.filter(o => isValidPositionRuns(arranged, o, maxRun));
      if (!valid.length) break;
      const chosen = randomChoice(valid);
      arranged.push(chosen);
      remaining.splice(remaining.indexOf(chosen), 1);
    }
    if (arranged.length === nTrials) return arranged;
  }
  // fallback: unconstrained pool
  console.warn('buildBalancedQuestionOrders: constraint not satisfied, using fallback');
  let pool = [];
  while (pool.length < nTrials) pool = pool.concat(shuffleArray([...allOrders]));
  return pool.slice(0, nTrials);
}

// ─────────────────────────────────────────────────────────────────────────────
//  LABEL RESOLVER
// ─────────────────────────────────────────────────────────────────────────────
function resolveLabel(infoType, peerName, expertLabel) {
  if (infoType === 'peer')   return peerName   ? `[${peerName}의 추천]` : null;
  if (infoType === 'expert') return expertLabel || null;
  return INFO_LABEL_MAP[infoType] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────────────────────────────────────
let win, globalClock;
let bgImage, infoImage, questionImage, fixImage;
let labelStim, scaleCircles, scaleNumbers, scaleLeftDesc, scaleRightDesc;
let currentScaleIdx; // null | 0-based integer

const resultsRows = [];
const timingRows  = [];
let eventCounter  = 0;

// ─────────────────────────────────────────────────────────────────────────────
//  VISUAL SETUP
// ─────────────────────────────────────────────────────────────────────────────

function makeScaleXs() {
  return Array.from({ length: CFG.scale_n }, (_, i) =>
    CFG.scale_x_left + i * (CFG.scale_x_right - CFG.scale_x_left) / (CFG.scale_n - 1)
  );
}

function createVisuals() {
  // Reusable image stims – size [2,2] norm = full screen
  bgImage       = new visual.ImageStim({ win, name:'bgImage',   pos:[0,0], units:'norm', size:[2,2] });
  infoImage     = new visual.ImageStim({ win, name:'infoImage', pos:[0,0], units:'norm', size:[2,2] });
  questionImage = new visual.ImageStim({ win, name:'qImage',    pos:[0,0], units:'norm', size:[2,2] });
  fixImage      = new visual.ImageStim({ win, name:'fixImage',  pos:[0,0], units:'norm', size:[2,2] });

  labelStim = new visual.TextStim({
    win, name:'label', text:'',
    pos:[CFG.label_x, CFG.label_y],
    height:CFG.text_height_big,
    color:CFG.text_color, font:CFG.font, bold:true,
    alignText:'left', anchorHoriz:'left', anchorVert:'top',
    units:'norm',
  });

  const xs = makeScaleXs();

  scaleCircles = xs.map((x, i) => new visual.Polygon({
    win, name:`circle_${i}`, edges:64,
    radius:CFG.circle_radius, pos:[x, CFG.scale_y],
    lineColor:CFG.text_color, lineWidth:4, fillColor:null, units:'height',
  }));

  scaleNumbers = xs.map((x, i) => new visual.TextStim({
    win, name:`num_${i}`, text:String(i + 1),
    pos:[x, CFG.numbers_y], height:CFG.text_height_medium,
    color:CFG.text_color, font:CFG.font, bold:true,
    alignText:'center', units:'height',
  }));

  scaleLeftDesc = new visual.TextStim({
    win, name:'leftDesc', text:'',
    pos:[CFG.scale_x_left - 2 * CFG.circle_radius, CFG.desc_y],
    height:CFG.text_height_small, color:CFG.text_color, font:CFG.font, bold:true,
    alignText:'left', anchorHoriz:'left', units:'height',
  });

  scaleRightDesc = new visual.TextStim({
    win, name:'rightDesc', text:'',
    pos:[CFG.scale_x_right + 2 * CFG.circle_radius, CFG.desc_y],
    height:CFG.text_height_small, color:CFG.text_color, font:CFG.font, bold:true,
    alignText:'right', anchorHoriz:'right', units:'height',
  });
}

function configureScale(leftLabel, rightLabel) {
  scaleLeftDesc.setText(leftLabel);
  scaleRightDesc.setText(rightLabel);
  currentScaleIdx = null;
}

function drawScale() {
  for (let i = 0; i < CFG.scale_n; i++) {
    scaleCircles[i].setFillColor(currentScaleIdx === i ? new util.Color('red') : null);
    scaleCircles[i].draw();
    scaleNumbers[i].draw();
  }
  scaleLeftDesc.draw();
  scaleRightDesc.draw();
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOGGING
// ─────────────────────────────────────────────────────────────────────────────

function logEvent(ID, trialIdx, eventType, stimName, startT, endT, rt) {
  eventCounter++;
  timingRows.push({
    ID,
    Trial    : trialIdx,
    EventN   : eventCounter,
    EventType: eventType,
    StimName : stimName,
    StartTime: startT,
    EndTime  : endT,
    Duration : eventType !== 'question' ? (endT - startT) : '',
    RT       : eventType === 'question' ? rt : '',
  });
}

/** Trigger a browser download of rows as a CSV */
function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
  const a = Object.assign(document.createElement('a'), {
    href    : URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' })),
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCREEN ROUTINES
// ─────────────────────────────────────────────────────────────────────────────

/** Show `stim` image for `duration` seconds. Draws `labelText` on top if provided. */
function showImageTimed(stim, imageName, duration, labelText) {
  stim.setImage(imageName);
  if (labelText) labelStim.setText(labelText);

  return new Promise(resolve => {
    const startT = globalClock.getTime();
    const endT   = startT + duration;
    (function frame() {
      stim.draw();
      if (labelText) labelStim.draw();
      win.flip();
      globalClock.getTime() >= endT
        ? resolve({ startT, endT: globalClock.getTime() })
        : requestAnimationFrame(frame);
    })();
  });
}

/** Show fixation image for a random duration in [fixMin, fixMax]. */
function showFixation(fixMin, fixMax) {
  fixImage.setImage('fixation.png');
  const duration = randUniform(fixMin ?? CFG.fix_min, fixMax ?? CFG.fix_max);
  return new Promise(resolve => {
    const startT = globalClock.getTime();
    const endT   = startT + duration;
    (function frame() {
      fixImage.draw();
      win.flip();
      globalClock.getTime() >= endT
        ? resolve({ startT, endT: globalClock.getTime() })
        : requestAnimationFrame(frame);
    })();
  });
}

/** Show intro image; advance on Space or Return. */
function showIntro() {
  bgImage.setImage('intro.png');
  return new Promise(resolve => {
    (function frame() {
      bgImage.draw();
      win.flip();
      psychoJS.eventManager.getKeys({ keyList:['space','return'] }).length
        ? resolve()
        : requestAnimationFrame(frame);
    })();
  });
}

/**
 * Show question background + Likert scale.
 * Arrow keys navigate, Return confirms.
 * Returns { score (1-7), rt, startT, endT }.
 */
function showQuestion(questionName, labelText) {
  const qDef = QUESTION_DEFS[questionName];
  questionImage.setImage(qDef.bg);
  configureScale(qDef.left, qDef.right);
  if (labelText) labelStim.setText(labelText);

  return new Promise(resolve => {
    psychoJS.eventManager.clearEvents({ eventType:'keyboard' });
    const startT = globalClock.getTime();

    (function frame() {
      questionImage.draw();
      if (labelText) labelStim.draw();
      drawScale();
      win.flip();

      for (const key of psychoJS.eventManager.getKeys({ keyList:['left','right','return'] })) {
        if (key === 'left') {
          currentScaleIdx = currentScaleIdx === null ? Math.floor(CFG.scale_n / 2) : Math.max(0, currentScaleIdx - 1);
        } else if (key === 'right') {
          currentScaleIdx = currentScaleIdx === null ? Math.floor(CFG.scale_n / 2) : Math.min(CFG.scale_n - 1, currentScaleIdx + 1);
        } else if (key === 'return' && currentScaleIdx !== null) {
          const endT = globalClock.getTime();
          resolve({ score: currentScaleIdx + 1, rt: endT - startT, startT, endT });
          return;
        }
      }
      requestAnimationFrame(frame);
    })();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN EXPERIMENT FLOW
// ─────────────────────────────────────────────────────────────────────────────

async function runExperiment() {
  // Window
  win = new visual.Window({
    fullscr:true, color:new util.Color([0,0,0]), units:'norm', waitBlanking:true,
  });
  win.mouseVisible = false;
  globalClock = new core.Clock();

  createVisuals();

  // Participant info from dialog
  const ID        = String(psychoJS.extraInfo['Participant ID']).trim();
  const peerNames = ['Peer 1','Peer 2','Peer 3','Peer 4']
    .map(k => String(psychoJS.extraInfo[k]).trim())
    .filter(n => n !== '');

  // Load product list via TrialHandler (reads conditions.csv)
  const trialHandler = new TrialHandler({
    psychoJS, nReps:1, method:TrialHandler.Method.SEQUENTIAL,
    trialList:'conditions.csv', name:'trials',
  });

  // Copy to plain array so we can shuffle & annotate
  let rows = trialHandler.trialList.map(r => ({ ...r }));

  // Per-participant randomisation
  rows = constrainedShuffle(rows, CFG.max_run);
  const infoAssignment = assignInfoTypes(rows, INFO_TYPES, CFG.max_run);

  // Question order pools
  const nTrials        = rows.length;
  const gptOrders      = buildBalancedQuestionOrders(permutations(GPT_QUESTIONS),   nTrials, CFG.question_order_max_run);
  const otherOrders    = buildBalancedQuestionOrders(permutations(OTHER_QUESTIONS), nTrials, CFG.question_order_max_run);
  let gptCounter = 0, otherCounter = 0;

  // Intro
  await showIntro();
  await showFixation(3, 3);

  // ── Trial loop ───────────────────────────────────────────────────────────────
  for (let tIdx = 0; tIdx < nTrials; tIdx++) {
    const trial    = rows[tIdx];
    const tNum     = tIdx + 1;
    const infoType = infoAssignment[tIdx];
    const code     = INFO_CODE_MAP[infoType];
    // Use the product_ENG value from your product_list.csv
    const pName = trial.product_ENG;
    const productFile = `stim/01_product/${trial.product_ENG}.png`;
    const infoFile    = `stim/02_information/${trial.product_ENG}_${code}.png`;
    // Label for this trial
    const peerName    = infoType === 'peer'   ? randomChoice(peerNames) : null;
    const expertLabel = infoType === 'expert' ? getExpertLabel(trial.product_ENG) : null;
    const labelText   = resolveLabel(infoType, peerName, expertLabel);

    // Product
    const { startT:pSt, endT:pEt } = await showImageTimed(bgImage, productFile, CFG.product_dur, null);
    logEvent(ID, tNum, 'product', productFile, pSt, pEt);

    // Fixation
    { const { startT:s, endT:e } = await showFixation(); logEvent(ID, tNum, 'fixation', 'fixation.png', s, e); }

    // Info
    const { startT:iSt, endT:iEt } = await showImageTimed(infoImage, infoFile, CFG.info_dur, labelText);
    logEvent(ID, tNum, 'info', infoFile, iSt, iEt);

    // Fixation
    { const { startT:s, endT:e } = await showFixation(); logEvent(ID, tNum, 'fixation', 'fixation.png', s, e); }

    // Question order for this trial
    const qOrder = infoType === 'gpt'
      ? [...gptOrders[gptCounter++   % gptOrders.length]]
      : [...otherOrders[otherCounter++ % otherOrders.length]];

    // Questions
    const qResults = {};
    for (const qname of qOrder) {
      const { score, rt, startT:qSt, endT:qEt } = await showQuestion(qname, labelText);
      qResults[qname] = { score, rt };

      // Log using the same StimName format as the real Timing CSV
      const stimLabel = { credEX:'credibility_EX', credCON:'credibility_CON',
        credPEER:'credibility_PEER', credGen:'credibility_general', preference:'preference' }[qname];
      logEvent(ID, tNum, 'question', stimLabel, qSt, qEt, rt);

      // Inter-question fixation
      const { startT:fs, endT:fe } = await showFixation();
      logEvent(ID, tNum, 'fixation', 'fixation.png', fs, fe);
    }

    // Results row — mirrors Results_<ID>.csv column order exactly
    const g   = k => qResults[k]?.score ?? '';
    const grt = k => qResults[k]?.rt    ?? '';
    const qOrderLabel = qOrder.map(q => ({
      credEX:'credibility_EX', credCON:'credibility_CON',
      credPEER:'credibility_PEER', credGen:'credibility_general', preference:'preference',
    }[q])).join('-');

    resultsRows.push({
      TrialNumber            : tNum,
      ProductFilePath        : productFile,
      product_ENG            : trial.product_ENG,
      product_KOR            : trial.product_KOR,
      genre                  : trial.genre,
      classification         : trial.classification,
      price_range            : trial.price_range,
      InfoType               : infoType,
      Q_Order                : qOrderLabel,
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
  }

  // ── Download output files (mirrors pilot_results/<ID>/ output) ───────────────
  downloadCSV(`Results_${ID}.csv`, resultsRows);
  downloadCSV(`Timing_${ID}.csv`,  timingRows);

  // End screen
  const endText = new visual.TextStim({
    win, text:'실험이 완료되었습니다.\n참여해 주셔서 감사합니다!',
    pos:[0,0], height:0.1, color:'white', font:CFG.font,
    wrapWidth:1.8, alignText:'center', units:'norm',
  });
  endText.draw();
  win.flip();
  await new Promise(r => setTimeout(r, 3000));

  psychoJS.quit({ message:'Experiment complete', isCompleted:true });
}

// ─────────────────────────────────────────────────────────────────────────────
//  RESOURCE LIST
//  Because info_type is assigned at runtime, ALL 4 info images per product
//  must be declared so PsychoJS preloads them before the experiment starts.
// ─────────────────────────────────────────────────────────────────────────────
const PRODUCTS = Object.keys(EXPERT_LABEL_MAP);

const resources = [
  { name: 'product_list.csv', path: 'product_list.csv' },
  { name: 'stim/00_fixation/fixation.png', path: 'stim/00_fixation/fixation.png' },
  { name: 'stim/04_intro/intro.png', path: 'stim/04_intro/intro.png' },
  { name: 'stim/03_question/credibility_EX.png', path: 'stim/03_question/credibility_EX.png' },
  { name: 'stim/03_question/credibility_CON.png', path: 'stim/03_question/credibility_CON.png' },
  { name: 'stim/03_question/credibility_PEER.png', path: 'stim/03_question/credibility_PEER.png' },
  { name: 'stim/03_question/credibility_general.png', path: 'stim/03_question/credibility_general.png' },
  { name: 'stim/03_question/preference.png', path: 'stim/03_question/preference.png' },
  ...PRODUCTS.map(p => ({ 
    name: `stim/01_product/${p}.png`, 
    path: `stim/01_product/${p}.png` 
  })),
  ...PRODUCTS.flatMap(p =>
    ['01','02','03','04'].map(c => ({ 
      name: `stim/02_information/${p}_${c}.png`, 
      path: `stim/02_information/${p}_${c}.png` 
    }))
  ),
];

// ─────────────────────────────────────────────────────────────────────────────
//  SCHEDULER ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
psychoJS.schedule(psychoJS.gui.DlgFromDict({
  dictionary : psychoJS.extraInfo,
  title      : '연구 참여 정보 입력',
}));

const flowScheduler   = new Scheduler(psychoJS);
const cancelScheduler = new Scheduler(psychoJS);

psychoJS.scheduleCondition(
  () => psychoJS.gui.dialogComponent.button === 'OK',
  flowScheduler, cancelScheduler
);

flowScheduler.add(psychoJS.setupWindowFromExperiment({ resources }));
flowScheduler.add(psychoJS.setupExperiment());
flowScheduler.add(() => runExperiment());

cancelScheduler.add(() => {
  psychoJS.quit({ message:'Cancelled by user' });
  return Scheduler.Event.QUIT;
});

psychoJS.start({ expName:'EndorsementStudy', expInfo: psychoJS.extraInfo });
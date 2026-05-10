/******************************************************************************
 * experiment.js - Endorsement Study
 * * Integration of behavioral_opt.py logic with samplesetup.js architecture.
 ******************************************************************************/

import { core, data, util, visual } from './lib/psychojs-2026.1.3.js';
const { PsychoJS } = core;
const { TrialHandler } = data;
const { Scheduler } = util;

// --- 1. CONFIGURATION (from behavioral_opt.py) ---
const CFG = {
  product_dur: 4.0,
  info_dur: 9.0,
  fix_min: 0.5,
  fix_max: 1.5,
  max_run: 2,
  question_order_max_run: 3,
  font: 'NanumGothic',
  scale_n: 7,
  circle_radius: 0.04, // norm units
  circle_spacing: 0.22
};

const INFO_LABEL_MAP = {
  '01': 'expert',
  '02': 'consensus',
  '03': 'peer',
  '04': 'gpt'
};

const QUESTION_DEFS = {
  'credEX':  { label: 'Expert Credibility', img: 'stim/03_question/credibility_EX.png' },
  'credCON': { label: 'Consensus Credibility', img: 'stim/03_question/credibility_CON.png' },
  'credPEER':{ label: 'Peer Credibility', img: 'stim/03_question/credibility_PEER.png' },
  'credGen': { label: 'General Credibility', img: 'stim/03_question/credibility_general.png' },
  'preference': { label: 'Preference', img: 'stim/03_question/preference.png' }
};

// --- 2. EXPERIMENT SETUP ---
let expName = 'EndorsementStudy';
let expInfo = { 'participant': '', 'session': '001', 'age': '', 'gender': ['male', 'female', 'other'] };

const psychoJS = new PsychoJS({ debug: true });
psychoJS.openWindow({
  fullscr: true,
  color: new util.Color('black'),
  units: 'height',
  waitBlanking: true
});

psychoJS.schedule(psychoJS.gui.DlgFromDict({ dictionary: expInfo, title: expName }));

const flowScheduler = new Scheduler(psychoJS);
const dialogCancelScheduler = new Scheduler(psychoJS);
psychoJS.scheduleCondition(() => (psychoJS.gui.dialogComponent.button === 'OK'), flowScheduler, dialogCancelScheduler);

// Define Flow
flowScheduler.add(updateInfo);
flowScheduler.add(experimentInit);
// Intro Routine
flowScheduler.add(introRoutineBegin());
flowScheduler.add(introRoutineEachFrame());
flowScheduler.add(introRoutineEnd());
// Trials Loop
const trialsLoopScheduler = new Scheduler(psychoJS);
flowScheduler.add(trialsLoopBegin(trialsLoopScheduler));
flowScheduler.add(trialsLoopScheduler);
flowScheduler.add(trialsLoopEnd);
// Finalize
flowScheduler.add(quitPsychoJS, 'Experiment finished.', true);
dialogCancelScheduler.add(quitPsychoJS, '', false);

// --- 3. RESOURCES ---
// Explicitly list essential files to avoid the "Init" hang
const RESOURCES = [
  { 'name': 'product_list.csv', 'path': 'product_list.csv' },
  { 'name': 'expert_labels.csv', 'path': 'expert_labels.csv' },
  { 'name': 'stim/00_fixation/fixation.png', 'path': 'stim/00_fixation/fixation.png' },
  { 'name': 'stim/04_intro/intro.png', 'path': 'stim/04_intro/intro.png' },
  { 'name': 'stim/03_question/credibility_EX.png', 'path': 'stim/03_question/credibility_EX.png' },
  { 'name': 'stim/03_question/credibility_CON.png', 'path': 'stim/03_question/credibility_CON.png' },
  { 'name': 'stim/03_question/credibility_PEER.png', 'path': 'stim/03_question/credibility_PEER.png' },
  { 'name': 'stim/03_question/credibility_general.png', 'path': 'stim/03_question/credibility_general.png' },
  { 'name': 'stim/03_question/preference.png', 'path': 'stim/03_question/preference.png' }
];

psychoJS.start({ expName, expInfo, resources: RESOURCES });

// --- 4. GLOBAL VARIABLES & STIMULI ---
let globalClock, routineTimer;
let fixStim, productStim, infoStim, questionBg, likertCircles = [], likertTexts = [];
let mouse, introImg;

async function updateInfo() {
  expInfo['date'] = util.MonotonicClock.getDateStr();
  psychoJS.experiment.dataFileName = `data/${expInfo['participant']}_${expName}_${expInfo['date']}`;
  return Scheduler.Event.NEXT;
}

async function experimentInit() {
  globalClock = new util.Clock();
  routineTimer = new util.CountdownTimer();
  mouse = new core.Mouse({ psychoJS });

  introImg = new visual.ImageStim({ win: psychoJS.window, image: 'stim/04_intro/intro.png', units: 'height', size: [1.2, 0.9] });
  fixStim = new visual.ImageStim({ win: psychoJS.window, image: 'stim/00_fixation/fixation.png', size: [0.1, 0.1] });
  productStim = new visual.ImageStim({ win: psychoJS.window, size: [0.8, 0.6] });
  infoStim = new visual.TextStim({ win: psychoJS.window, text: '', height: 0.04, wrapWidth: 0.8, color: 'white' });
  questionBg = new visual.ImageStim({ win: psychoJS.window, size: [1.0, 0.8], pos: [0, 0.1] });

  // Likert Scale (7-point)
  for (let i = 0; i < CFG.scale_n; i++) {
    let x = (i - (CFG.scale_n - 1) / 2) * CFG.circle_spacing;
    likertCircles.push(new visual.Polygon({
      win: psychoJS.window, edges: 32, radius: CFG.circle_radius,
      pos: [x, -0.3], fillColor: 'white', lineColor: 'gray'
    }));
    likertTexts.push(new visual.TextStim({
      win: psychoJS.window, text: (i + 1).toString(),
      pos: [x, -0.3], height: 0.03, color: 'black'
    }));
  }
  return Scheduler.Event.NEXT;
}

// --- 5. DATA HANDLING & RANDOMIZATION (The behavioral_opt.py engine) ---
function trialsLoopBegin(thisScheduler) {
  return async function() {
    // 1. Load CSVs
    const productRaw = psychoJS.serverManager.getResource('product_list.csv');
    const expertRaw = psychoJS.serverManager.getResource('expert_labels.csv');
    const productList = util.csvToArray(productRaw); // Array of objects
    const expertMap = util.csvToArray(expertRaw).reduce((acc, row) => {
      acc[row.product_ENG] = row.expert_label;
      return acc;
    }, {});

    // 2. Behavioral Logic: Assign conditions and shuffle
    // (Simplified version of balanced assignment)
    let trials = productList.map((p, i) => {
      let infoType = ['01','02','03','04'][i % 4]; // Round robin for balance
      return { ...p, infoType };
    });
    util.shuffle(trials);

    const trialsLoop = new TrialHandler({ psychoJS, trialList: trials, nReps: 1, method: TrialHandler.Method.SEQUENTIAL });
    psychoJS.experiment.addLoop(trialsLoop);

    for (const thisTrial of trialsLoop) {
      thisScheduler.add(importConditions(trialsLoop));
      thisScheduler.add(trialRoutineBegin(thisTrial, expertMap));
      thisScheduler.add(trialRoutineEachFrame());
      thisScheduler.add(trialRoutineEnd());
    }
    return Scheduler.Event.NEXT;
  };
}

// --- 6. ROUTINES ---
function introRoutineBegin() {
  return async function() {
    introImg.setAutoDraw(true);
    mouse.getPressed(); // clear
    return Scheduler.Event.NEXT;
  };
}

function introRoutineEachFrame() {
  return async function() {
    if (mouse.getPressed()[0] === 1) return Scheduler.Event.NEXT;
    return Scheduler.Event.FLIP_REPEAT;
  };
}

function introRoutineEnd() {
  return async function() {
    introImg.setAutoDraw(false);
    return Scheduler.Event.NEXT;
  };
}

let currentTrialData;
function trialRoutineBegin(trial, expertMap) {
  return async function() {
    currentTrialData = trial;
    // Set Product image
    productStim.setImage(trial.image_path);
    // Set Endorsement text based on type
    let text = "";
    if (trial.infoType === '01') text = expertMap[trial.product_ENG] || "Expert recommendation...";
    else if (trial.infoType === '02') text = "85% of users recommend this.";
    else if (trial.infoType === '03') text = "Your friends liked this.";
    else text = "AI suggests this product.";
    infoStim.setText(text);
    
    routineTimer.set(CFG.product_dur + CFG.info_dur + 10.0); // plus buffer for Qs
    return Scheduler.Event.NEXT;
  };
}

// ... Additional routine logic continues here, managing flips for Product -> Info -> Questions
// Data is saved using: psychoJS.experiment.addData('column_name', value);

async function quitPsychoJS(message, isCompleted) {
  psychoJS.window.close();
  psychoJS.quit({ message, isCompleted });
  return Scheduler.Event.NEXT;
}

function importConditions(currentLoop) {
  return async function () {
    psychoJS.importAttributes(currentLoop.getCurrentTrial());
    return Scheduler.Event.NEXT;
  };
}
/******************************************************************************
 * experiment.js - Endorsement Study (v2026.1.3)
 * Aligning with behavioral_opt.py logic
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
  text_color: 'white'
};

// --- 2. INITIALIZE PSYCHOJS ---
const psychoJS = new PsychoJS({ debug: true });

// Setup Window
psychoJS.openWindow({
  fullscr: true,
  color: new util.Color('black'),
  units: 'norm',
  waitBlanking: true
});

// --- 3. STARTUP DIALOG (Participant ID + 4 Peer Names) ---
let expInfo = {
  'Participant ID': '',
  'Friend 1': '',
  'Friend 2': '',
  'Friend 3': '',
  'Friend 4': ''
};

psychoJS.schedule(psychoJS.gui.DlgFromDict({
  dictionary: expInfo,
  title: 'Endorsement Study'
}));

// --- 4. GLOBAL COMPONENT VARIABLES ---
let win, fixStim, productStim, infoStim, trialsLoop;
let resources = [
  { name: 'product_list.xlsx', path: 'product_list.xlsx' },
  { name: 'stim/fixation.png', path: 'stim/fixation.png' }
  // Add other required image paths here as in behavioral_opt.py
];

// --- 5. EXPERIMENT FLOW ---
const flowScheduler = new Scheduler(psychoJS);

flowScheduler.add(updateResourcePaths); // Prep resource list
flowScheduler.add(experimentInit);      // Create visuals
flowScheduler.add(trialsLoopBegin);     // Setup randomization logic
flowScheduler.add(trialsLoop);          // Run the loop
flowScheduler.add(quitPsychoJS);        // Save and exit

// Start the experiment
psychoJS.start({
  expName: 'Endorsement Study',
  expInfo: expInfo,
  resources: resources
});

// --- 6. INITIALIZATION FUNCTION ---
function experimentInit() {
  win = psychoJS.window;

  fixStim = new visual.TextStim({
    win: win,
    text: '+',
    font: 'Arial',
    pos: [0, 0], height: 0.1, color: new util.Color(CFG.text_color)
  });

  productStim = new visual.ImageStim({
    win: win,
    image: undefined,
    pos: [0, 0.2], size: [0.8, 0.8]
  });

  infoStim = new visual.TextStim({
    win: win,
    text: '',
    font: CFG.font,
    pos: [0, -0.4], height: 0.05, 
    color: new util.Color(CFG.text_color),
    wrapWidth: 1.5
  });

  return Scheduler.Event.NEXT;
}

// --- 7. TRIAL LOGIC (Aligning with behavioral_opt.py) ---
function trialsLoopBegin() {
  // Load trials from the Excel file
  const trialList = data.importConditions(psychoJS.serverManager.getResource('product_list.xlsx'));
  
  trialsLoop = new TrialHandler({
    psychoJS: psychoJS,
    nReps: 1, 
    method: TrialHandler.Method.RANDOM,
    extraInfo: expInfo, 
    originPath: undefined,
    trialList: trialList,
    seed: undefined, 
    name: 'trialsLoop'
  });

  return Scheduler.Event.NEXT;
}

async function trialRoutineBegin(snapshot) {
  return async function() {
    const trial = snapshot.getCurrentTrial();
    
    // Set Product
    productStim.setImage(trial.image_path);
    
    // Peer Endorsement Logic (InfoType 03)
    // Mirrors behavioral_opt.py: Replace generic text with names from the dialog
    let infoText = trial.infoText;
    if (trial.infoType === '03') {
      const friends = [expInfo['Friend 1'], expInfo['Friend 2'], expInfo['Friend 3'], expInfo['Friend 4']];
      const selectedFriend = friends[Math.floor(Math.random() * friends.length)] || "친구";
      infoText = `${selectedFriend}님이 이 제품을 추천합니다.`;
    }
    
    infoStim.setText(infoText);
    
    return Scheduler.Event.NEXT;
  };
}

// --- 8. FINISH & QUIT ---
function trialsLoopEnd() {
  return async function () {
    return Scheduler.Event.NEXT;
  };
}

async function quitPsychoJS() {
  psychoJS.window.close();
  psychoJS.quit();
  return Scheduler.Event.NEXT;
}
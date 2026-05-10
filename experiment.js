/******************************************************************************
 * experiment.js - Endorsement Study (Full Port)
 ******************************************************************************/

import { core, data, util, visual } from './lib/psychojs-2026.1.3.js';
const { PsychoJS } = core;
const { TrialHandler } = data;
const { Scheduler } = util;

// --- 1. CONFIGURATION ---
const CFG = {
  product_dur: 4.0,
  info_dur: 9.0,
  fix_min: 0.5,
  fix_max: 1.5,
  scale_n: 7,
  circle_radius: 0.04,
  circle_spacing: 0.22,
  font: 'NanumGothic'
};

// 질문 정의 및 한국어 레이블 (Likert 좌/우 끝 텍스트)
const QUESTION_DEFS = {
  credEX:     { img: 'stim/03_question/credibility_EX.png',      left: '전혀 전문적이지 않다', right: '매우 전문적이다' },
  credCON:    { img: 'stim/03_question/credibility_CON.png',     left: '전혀 반영하지 않는다', right: '매우 반영한다'  },
  credPEER:   { img: 'stim/03_question/credibility_PEER.png',    left: '전혀 가깝지 않다',     right: '매우 가깝다'    },
  credGen:    { img: 'stim/03_question/credibility_general.png', left: '전혀 믿지 않음',       right: '매우 신뢰함'    },
  preference: { img: 'stim/03_question/preference.png',          left: '전혀 선호하지 않음',   right: '매우 선호함'    }
};

// 조건별 노출 질문 리스트
const GPT_QUESTIONS   = ['credEX', 'credCON', 'credPEER', 'credGen', 'preference'];
const OTHER_QUESTIONS = ['credGen', 'preference'];

const psychoJS = new PsychoJS({ debug: true });

// --- 2. DIALOG ---
let expInfo = { 'Participant ID': '', 'Friend 1': '', 'Friend 2': '', 'Friend 3': '', 'Friend 4': '' };
psychoJS.schedule(psychoJS.gui.DlgFromDict({ dictionary: expInfo, title: '연구 참여 정보 입력' }));

// --- 3. INITIALIZATION ---
let win, fixStim, productStim, infoStim, questionStim, leftLabel, rightLabel, circles = [], labels = [], expertMap = {};

function experimentInit() {
  win = psychoJS.window;

  // 전문가 라벨 데이터 로드
  const expertLabels = data.importConditions(psychoJS.serverManager.getResource('expert_labels.csv'));
  expertLabels.forEach(row => { expertMap[row.product_ENG] = row.expert_label; });

  fixStim      = new visual.ImageStim({ win, image: 'stim/00_fixation/fixation.png', size: [0.1, 0.1] });
  productStim  = new visual.ImageStim({ win, pos: [0, 0.4], size: [0.6, 0.6] });
  infoStim     = new visual.TextStim({ win, pos: [0, -0.2], height: 0.06, color: 'white', font: CFG.font, wrapWidth: 1.2 });
  questionStim = new visual.ImageStim({ win, pos: [0, 0.6], size: [0.8, 0.3] });

  leftLabel  = new visual.TextStim({ win, pos: [-0.8, -0.75], height: 0.035, color: 'white', font: CFG.font, alignHoriz: 'left' });
  rightLabel = new visual.TextStim({ win, pos: [0.8, -0.75], height: 0.035, color: 'white', font: CFG.font, alignHoriz: 'right' });

  // 7점 리커트 척도 생성
  for (let i = 0; i < CFG.scale_n; i++) {
    let x = (i - (CFG.scale_n - 1) / 2) * CFG.circle_spacing;
    circles.push(new visual.Polygon({ win, edges: 32, radius: CFG.circle_radius, fillColor: 'white', pos: [x, -0.6] }));
    labels.push(new visual.TextStim({ win, text: (i + 1).toString(), pos: [x, -0.7], height: 0.04, color: 'white' }));
  }
  return Scheduler.Event.NEXT;
}

// --- 4. TRIAL ROUTINE ---
function trialRoutine(trial) {
  return async function() {
    // A. Fixation (Jittered)
    fixStim.draw(); win.flip();
    await util.sleep((Math.random() * (CFG.fix_max - CFG.fix_min) + CFG.fix_min) * 1000);

    // B. Product Display
    productStim.setImage(`stim/01_product/${trial.product_ENG}.png`);
    productStim.draw(); win.flip();
    await util.sleep(CFG.product_dur * 1000);

    // C. Endorsement Logic (요청하신 텍스트 반영)
    let infoText = "";
    if (trial.infoType === '01') {
      infoText = expertMap[trial.product_ENG] || "전문가 추천";
    } else if (trial.infoType === '02') {
      infoText = "[소비자 의견 종합]";
    } else if (trial.infoType === '03') {
      const friends = [expInfo['Friend 1'], expInfo['Friend 2'], expInfo['Friend 3'], expInfo['Friend 4']].filter(n => n !== "");
      const selectedFriend = friends[Math.floor(Math.random() * friends.length)] || "친구";
      infoText = `"${selectedFriend}"님의 추천`;
    } else if (trial.infoType === '04') {
      infoText = "[ChatGPT]";
    }

    infoStim.setText(infoText);
    productStim.draw(); infoStim.draw(); win.flip();
    await util.sleep(CFG.info_dur * 1000);

    // D. Questioning Phase
    const qKeys = (trial.infoType === '04') ? GPT_QUESTIONS : OTHER_QUESTIONS;
    util.shuffle(qKeys); // 질문 순서 랜덤화

    for (let key of qKeys) {
      let q = QUESTION_DEFS[key];
      let response = null;
      let responseTime = 0;
      const qStartTime = util.MonotonicClock.getReferenceTime();

      questionStim.setImage(q.img);
      leftLabel.setText(q.left);
      rightLabel.setText(q.right);

      while (response === null) {
        questionStim.draw(); leftLabel.draw(); rightLabel.draw();
        circles.forEach(c => c.draw()); labels.forEach(l => l.draw());
        win.flip();

        let mouse = psychoJS.eventManager.getMouse();
        if (mouse.getPressed()[0] === 1) {
          for (let i = 0; i < circles.length; i++) {
            if (circles[i].contains(mouse)) {
              response = i + 1;
              responseTime = util.MonotonicClock.getReferenceTime() - qStartTime;
              psychoJS.experiment.addData(`${key}_val`, response);
              psychoJS.experiment.addData(`${key}_RT`, responseTime);
              await util.sleep(250); // 디바운스
            }
          }
        }
      }
    }
    psychoJS.experiment.nextEntry();
    return Scheduler.Event.NEXT;
  };
}

// --- 5. LOOP & SCHEDULER ---
function trialsLoopBegin() {
  const trialList = data.importConditions(psychoJS.serverManager.getResource('conditions.csv'));
  const trials = new TrialHandler({ psychoJS, trialList, nReps: 1, method: TrialHandler.Method.RANDOM });
  for (const thisTrial of trials) flowScheduler.add(trialRoutine(thisTrial));
  return Scheduler.Event.NEXT;
}

const flowScheduler = new Scheduler(psychoJS);
flowScheduler.add(experimentInit);
flowScheduler.add(trialsLoopBegin);
flowScheduler.add(() => psychoJS.quit());

// --- 6. START ---
psychoJS.start({ 
  expName: 'Endorsement Study', 
  expInfo, 
  resources: [
    { name: 'product_list.csv', path: 'product_list.csv' },
    { name: 'expert_labels.csv', path: 'expert_labels.csv' },
    { name: 'stim/00_fixation/fixation.png', path: 'stim/00_fixation/fixation.png' }
  ] 
});
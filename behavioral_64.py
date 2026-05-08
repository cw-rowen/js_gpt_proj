import random
from psychopy import visual, event,core,data
from psychopy import gui
import numpy as np
import pickle,datetime
import pyglet
import os
import itertools
import pandas as pd
import re
from collections import defaultdict
import random
from PIL import Image
import csv


global_clock = core.Clock()

event_log = []
event_counter = 0
results_rows = []   # ✅ our own crash-safe results table

def checked_wait(seconds):
    t0 = global_clock.getTime()
    while (global_clock.getTime() - t0) < seconds:
        if event.getKeys(['escape']):
            raise KeyboardInterrupt
        core.wait(0.01)  # small sleep to reduce CPU

def fit_size_to_window(img_path, win):
    iw, ih = Image.open(img_path).size
    ww, wh = win.size
    scale = min(ww / iw, wh / ih)
    return (iw * scale, ih * scale)

def log_event(ID, trial_index, event_type, stim_name, start_t, end_t, rt=None):
    global event_counter
    event_counter += 1

    # Duration only for non-question events
    if event_type == "question":
        duration = ""   # blank
    else:
        duration = (end_t - start_t) if (start_t is not None and end_t is not None) else ""

    # RT only for question events
    if event_type != "question":
        rt = ""

    event_log.append({
        "ID": ID,
        "Trial": trial_index,
        "EventN": event_counter,
        "EventType": event_type,
        "StimName": stim_name,
        "StartTime": start_t,
        "EndTime": end_t,
        "Duration": duration,
        "RT": rt
    })

def norm(s):
    s = str(s).strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


# -------Randomize Combination----------
def is_valid_order(rows, max_run=2):
    run = 1
    for i in range(1, len(rows)):
        prev_combo = (
            rows[i-1]["genre"],
            rows[i-1]["classification"],
            rows[i-1]["price_range"]
        )
        curr_combo = (
            rows[i]["genre"],
            rows[i]["classification"],
            rows[i]["price_range"]
        )

        if curr_combo == prev_combo:
            run += 1
            if run > max_run:
                return False
        else:
            run = 1
    return True


def constrained_shuffle(rows, max_run=2, max_tries=20000, seed=None):
    rng = random.Random(seed)
    rows = list(rows)
    for _ in range(max_tries):
        rng.shuffle(rows)
        if is_valid_order(rows, max_run=max_run):
            return rows
    raise RuntimeError("Could not find a valid randomized order.")
    
# -------Randomize info order----------
def is_valid_run(seq, max_run=2):
    run = 1
    for i in range(1, len(seq)):
        if seq[i] == seq[i-1]:
            run += 1
            if run > max_run:
                return False
        else:
            run = 1
    return True

def constrained_shuffle_1d(seq, max_run=2, max_tries=20000, seed=None):
    rng = random.Random(seed)
    seq = list(seq)
    for _ in range(max_tries):
        rng.shuffle(seq)
        if is_valid_run(seq, max_run=max_run):
            return seq
    raise RuntimeError("Could not find valid InfoType order.")

#-------InfoType assignment with combo link + run constraint----------
def assign_info_types_balanced(rows, info_types, max_run=2, seed=None, max_tries=5000):
    """
    rows: list of dicts that contain keys: genre, classification, price_range
    info_types: e.g. ["expert","consensus","peer","gpt"]
    Returns: list of info_type per row index (same length as rows)
    
    Constraints:
      - overall InfoType counts as even as possible
      - within each (genre, classification, price_range) combo counts as even as possible
      - no more than max_run same InfoType consecutively
    """
    rng = random.Random(seed)

    def combo_key(r):
        return (r["genre"], r["classification"], r["price_range"])

    n = len(rows)
    combos = [combo_key(r) for r in rows]

    # targets: overall each info appears ~ n/len(info_types)
    # (we use greedy "keep counts minimal" rather than hard targets — more flexible)
    for _ in range(max_tries):
        overall = defaultdict(int)                      # overall counts per info
        per_combo = defaultdict(lambda: defaultdict(int))  # per_combo[combo][info]
        assigned = []

        ok = True
        for i in range(n):
            ck = combos[i]

            # candidate types filtered by run rule
            candidates = list(info_types)
            if len(assigned) >= max_run:
                if all(x == assigned[-1] for x in assigned[-max_run:]):
                    # last max_run are identical -> can't choose that same type again
                    blocked = assigned[-1]
                    candidates = [t for t in candidates if t != blocked]

            if not candidates:
                ok = False
                break

            # Score candidates: prefer the ones with smallest per-combo count, then smallest overall count
            # Add tiny randomness to break ties
            scored = []
            for t in candidates:
                scored.append((
                    per_combo[ck][t],      # primary: combo balance
                    overall[t],            # secondary: overall balance
                    rng.random(),          # tie-break
                    t
                ))
            scored.sort()
            chosen = scored[0][3]

            assigned.append(chosen)
            overall[chosen] += 1
            per_combo[ck][chosen] += 1

        if ok:
            return assigned

    raise RuntimeError("Could not assign InfoTypes satisfying constraints. Try higher max_tries or relax constraints.")



def showFixation(mindur = 0.5, maxdur = 1.5,Fixation = True):
    if Fixation:
        duration = np.random.uniform(mindur,maxdur)
        
        path = r'stim_32/00_fixation/fixation.png'
        
        stim = visual.ImageStim(win, image=path, pos=(0, 0))
        stim.size = fit_size_to_window(path, win)
        
        stim.draw()
        start_time = global_clock.getTime()
        win.flip()
        checked_wait(duration)
        end_time  = global_clock.getTime()
        return start_time, end_time

def showIntro():
    path = r"stim_32/04_intro/intro.png"
    stim = visual.ImageStim(win, image=path, pos=(0, 0))
    stim.size = fit_size_to_window(path, win)  # fills screen while preserving aspect ratio

    while True:
        stim.draw()
        win.flip()

        # wait for SPACE (or ENTER) to start; ESC to quit
        keys = event.waitKeys(keyList=['space', 'return', 'escape'])
        if 'escape' in keys:
            raise KeyboardInterrupt
        if 'space' in keys or 'return' in keys:
            return

def showProduct(imagename):
    root = r'stim_32/01_product'
    path = os.path.join(root,imagename)
    
    stim = visual.ImageStim(win, image=path, pos=(0, 0))
    stim.size = fit_size_to_window(path, win)
    
    stim.draw()
    start_time = global_clock.getTime()
    win.flip()
    checked_wait(4)
    end_time = global_clock.getTime()
    return start_time, end_time


def showInfo(imagename):
    root = r'stim_32/02_information'
    path = os.path.join(root, imagename)
    
    stim = visual.ImageStim(win, image=path, pos=(0, 0))
    stim.size = fit_size_to_window(path, win)
    
    stim.draw()
    start_time = global_clock.getTime()
    win.flip()
    checked_wait(9)
    end_time = global_clock.getTime()
    return start_time, end_time

info_kor_map = {
    "expert": "[전문가 의견]",
    "consensus": "[다수 의견]",
    "peer": "[친구 의견]", #change to friend name
    "gpt": "[GPT 의견]"
}

def showCredibilityEX(info_type):
    path = r'stim_32/03_question/credibility_EX.png'
    
    stim = visual.ImageStim(win, image = path, pos = [0,0])
    stim.size = fit_size_to_window(path, win)
    
    info_label = visual.TextStim(
        win,
        text=info_kor_map.get(info_type, info_type),
        pos=(-900, 480),
        height=65,
        color='white',
        font='NanumGothic-Bold',
        alignText='left',
        anchorHoriz='left'
    )
    
    scale_labels = [visual.TextStim(win, text=str(i+1), pos=(-750 + i*250, -370), height=50, color='white') for i in range(7)]
    circles = [visual.Circle(win, radius=50, edges=128, pos=(-750 + i*250, -250), lineColor='white', lineWidth=8) for i in range(7)]
    
    left_desc = visual.TextStim(
        win,
        text="전혀 전문적이지 않다",
        pos=(-750, -450),   # 1번 아래
        height=35,
        font='NanumGothic-Bold',
        color='white',
        alignText='center'
    )

    right_desc = visual.TextStim(
        win,
        text="매우 전문적이다",
        pos=(750, -450),    # 7번 아래
        height=35,
        font='NanumGothic-Bold',
        color='white',
        alignText='center'
    )
    
    current_index = None # invisible at first
    
    while True:
        # Draw all visuals
        stim.draw()
        info_label.draw()
        
        for i in range(7):
            circles[i].fillColor = 'red' if current_index == i else None
            circles[i].draw()
            scale_labels[i].draw()
            
        left_desc.draw()
        right_desc.draw()
            
        event.clearEvents(eventType='keyboard')   # ✅ clear BEFORE flip
        start_time = global_clock.getTime()
        win.flip()

        keys = event.waitKeys(
            keyList=['left', 'right', 'return', 'escape'],
            timeStamped=global_clock,
            clearEvents=False                      # ✅ don’t wipe fresh presses
        )

        for key, timestamp in keys:
            if key == 'escape':
                raise KeyboardInterrupt
            if key == 'left':
                if current_index is None:
                    current_index = 3 # first visible selection becomes 4
                elif current_index > 0:
                    current_index -= 1
            elif key == 'right':
                if current_index is None:
                    current_index = 3
                elif current_index < 6:
                    current_index += 1
            elif key == 'return' and current_index is not None:
                rt = timestamp - start_time
                end_time = global_clock.getTime()
                return current_index + 1, rt, start_time, end_time, end_time - start_time
    
def showCredibilityCON(info_type):
    path = r'stim_32/03_question/credibility_CON.png'
    
    stim = visual.ImageStim(win, image = path, pos = [0,0])
    stim.size = fit_size_to_window(path, win)
    
    info_label = visual.TextStim(
        win,
        text=info_kor_map.get(info_type, info_type),
        pos=(-900, 480),
        height=65,
        font='NanumGothic-Bold',
        color='white',
        alignText='left',
        anchorHoriz='left'
    )
    
    scale_labels = [visual.TextStim(win, text=str(i+1), pos=(-750 + i*250, -370), height=50, color='white') for i in range(7)]
    circles = [visual.Circle(win, radius=50, edges=128, pos=(-750 + i*250, -250), lineColor='white', lineWidth=8) for i in range(7)]
    
    left_desc = visual.TextStim(
        win,
        text="전혀 반영하지 않는다",
        pos=(-750, -450),   # 1번 아래
        height=35,
        font='NanumGothic-Bold',
        color='white',
        alignText='center'
    )

    right_desc = visual.TextStim(
        win,
        text="매우 반영한다",
        pos=(750, -450),    # 7번 아래
        height=35,
        font='NanumGothic-Bold',
        color='white',
        alignText='center'
    )
    
    current_index = None # invisible at first
    
    while True:
        # Draw all visuals
        stim.draw()
        info_label.draw()
        
        for i in range(7):
            circles[i].fillColor = 'red' if current_index == i else None
            circles[i].draw()
            scale_labels[i].draw()
            
        left_desc.draw()
        right_desc.draw()
            
        event.clearEvents(eventType='keyboard')   # ✅ clear BEFORE flip
        start_time = global_clock.getTime()
        win.flip()

        keys = event.waitKeys(
            keyList=['left', 'right', 'return', 'escape'],
            timeStamped=global_clock,
            clearEvents=False                      # ✅ don’t wipe fresh presses
        )

        for key, timestamp in keys:
            if key == 'escape':
                raise KeyboardInterrupt
            if key == 'left':
                if current_index is None:
                    current_index = 3 # first visible selection becomes 4
                elif current_index > 0:
                    current_index -= 1
            elif key == 'right':
                if current_index is None:
                    current_index = 3
                elif current_index < 6:
                    current_index += 1
            elif key == 'return' and current_index is not None:
                rt = timestamp - start_time
                end_time = global_clock.getTime()
                return current_index + 1, rt, start_time, end_time, end_time - start_time
                
  
def showCredibilityPEER(info_type):
    path = r'stim_32/03_question/credibility_PEER.png'
    
    stim = visual.ImageStim(win, image = path, pos = [0,0])
    stim.size = fit_size_to_window(path, win)
    
    info_label = visual.TextStim(
        win,
        text=info_kor_map.get(info_type, info_type),
        pos=(-900, 480),
        height=65,
        color='white',
        font='NanumGothic-Bold',
        alignText='left',
        anchorHoriz='left'
    )
    
    scale_labels = [visual.TextStim(win, text=str(i+1), pos=(-750 + i*250, -370), height=50, color='white') for i in range(7)]
    circles = [visual.Circle(win, radius=50, edges=128, pos=(-750 + i*250, -250), lineColor='white', lineWidth=8) for i in range(7)]
    
    left_desc = visual.TextStim(
        win,
        text="전혀 가깝지 않다",
        pos=(-750, -450),   # 1번 아래
        height=35,
        font='NanumGothic-Bold',
        color='white',
        alignText='center'
    )

    right_desc = visual.TextStim(
        win,
        text="매우 가깝다",
        pos=(750, -450),    # 7번 아래
        height=35,
        font='NanumGothic-Bold',
        color='white',
        alignText='center'
    )
    
    current_index = None # invisible at first
    
    while True:
        # Draw all visuals
        stim.draw()
        info_label.draw()
        
        for i in range(7):
            circles[i].fillColor = 'red' if current_index == i else None
            circles[i].draw()
            scale_labels[i].draw()
            
        left_desc.draw()
        right_desc.draw()
            
        event.clearEvents(eventType='keyboard')   # ✅ clear BEFORE flip
        start_time = global_clock.getTime()
        win.flip()

        keys = event.waitKeys(
            keyList=['left', 'right', 'return', 'escape'],
            timeStamped=global_clock,
            clearEvents=False                      # ✅ don’t wipe fresh presses
        )

        for key, timestamp in keys:
            if key == 'escape':
                raise KeyboardInterrupt
            if key == 'left':
                if current_index is None:
                    current_index = 3 # first visible selection becomes 4
                elif current_index > 0:
                    current_index -= 1
            elif key == 'right':
                if current_index is None:
                    current_index = 3
                elif current_index < 6:
                    current_index += 1
            elif key == 'return' and current_index is not None:
                rt = timestamp - start_time
                end_time = global_clock.getTime()
                return current_index + 1, rt, start_time, end_time, end_time - start_time
                

def showCredibilityGEN(info_type):
    path = r'stim_32/03_question/credibility_general.png'
    
    stim = visual.ImageStim(win, image = path, pos = [0,0])
    stim.size = fit_size_to_window(path, win)
    
#    info_label = visual.TextStim(
#        win,
#        text=info_kor_map.get(info_type, info_type),
#        pos=(-900, 480),
#        height=45,
#        font='NanumGothic-Bold',
#        color='white',
#        alignText='left',
#        anchorHoriz='left'
#    )
    
    scale_labels = [visual.TextStim(win, text=str(i+1), pos=(-750 + i*250, -370), height=50, color='white') for i in range(7)]
    circles = [visual.Circle(win, radius=50, edges=128, pos=(-750 + i*250, -250), lineColor='white', lineWidth=8) for i in range(7)]
    
    current_index = None # invisible at first
    
    while True:
        # Draw all visuals
        stim.draw()
        #info_label.draw()
        
        for i in range(7):
            circles[i].fillColor = 'red' if current_index == i else None
            circles[i].draw()
            scale_labels[i].draw()
            
        event.clearEvents(eventType='keyboard')   # ✅ clear BEFORE flip
        start_time = global_clock.getTime()
        win.flip()

        keys = event.waitKeys(
            keyList=['left', 'right', 'return', 'escape'],
            timeStamped=global_clock,
            clearEvents=False                      # ✅ don’t wipe fresh presses
        )

        for key, timestamp in keys:
            if key == 'escape':
                raise KeyboardInterrupt
            if key == 'left':
                if current_index is None:
                    current_index = 3 # first visible selection becomes 4
                elif current_index > 0:
                    current_index -= 1
            elif key == 'right':
                if current_index is None:
                    current_index = 3
                elif current_index < 6:
                    current_index += 1
            elif key == 'return' and current_index is not None:
                rt = timestamp - start_time
                end_time = global_clock.getTime()
                return current_index + 1, rt, start_time, end_time, end_time - start_time  # return 1~7 scale and RT
    

def showPreference(info_type):
    path = r'stim_32/03_question/preference.png'
    
    stim = visual.ImageStim(win, image = path, pos = [0,0])
    stim.size = fit_size_to_window(path, win)
    
    scale_labels = [visual.TextStim(win, text=str(i+1), pos=(-750 + i*250, -370), height=50, color='white') for i in range(7)]
    circles = [visual.Circle(win, radius=50, edges=128, pos=(-750 + i*250, -250), lineColor='white', lineWidth=8) for i in range(7)]
    
    current_index = None # invisible at first
    
    while True:
        # Draw all visuals
        stim.draw()
        for i in range(7):
            circles[i].fillColor = 'red' if current_index == i else None
            circles[i].draw()
            scale_labels[i].draw()
        
        event.clearEvents(eventType='keyboard')   # ✅ clear BEFORE flip
        start_time = global_clock.getTime()
        win.flip()

        keys = event.waitKeys(
            keyList=['left', 'right', 'return', 'escape'],
            timeStamped=global_clock,
            clearEvents=False                      # ✅ don’t wipe fresh presses
        )

        for key, timestamp in keys:
            if key == 'escape':
                raise KeyboardInterrupt
            if key == 'left':
                if current_index is None:
                    current_index = 3 # first visible selection becomes 4
                elif current_index > 0:
                    current_index -= 1
            elif key == 'right':
                if current_index is None:
                    current_index = 3
                elif current_index < 6:
                    current_index += 1
            elif key == 'return' and current_index is not None:
                rt = timestamp - start_time
                end_time = global_clock.getTime()
                return current_index + 1, rt, start_time, end_time, end_time - start_time


    

# ---------- ID popup + duplicate check ----------
info = {"ID": ""}
dlg = gui.DlgFromDict(info, title="Participant Info", order=["ID"])
if not dlg.OK:
    core.quit()

ID = str(info["ID"]).strip()
if ID == "":
    err = gui.Dlg(title="Error")
    err.addText("ID cannot be empty.")
    err.show()
    core.quit()

# Optional: force numeric IDs to 3 digits (uncomment if you want)
# if ID.isdigit():
#     ID = ID.zfill(3)

out_dir = os.path.join("pilot_results", ID)

# block if ID already used
if os.path.exists(out_dir):
    err = gui.Dlg(title="ID already exists")
    err.addText(f"ID '{ID}' already has a folder:\n{out_dir}\n\nChoose a new ID.")
    err.show()
    core.quit()

os.makedirs(out_dir, exist_ok=False)
# -----------------------------------------------

win = visual.Window(fullscr=True, screen=0, color="black", units="pix", allowGUI=False, winType='pyglet') #open a window # screen = 0 : 1st monitor, 1 : 2nd monitor
win.mouseVisible = False

PRODUCT_DIR = r"stim_32/01_product"
PRODUCT_XLSX = r"product_list_32.xlsx"   # put this file next to your script (or use an absolute path)

df = pd.read_excel(PRODUCT_XLSX)
# guard: Excel must not have duplicate column names
if df.columns.duplicated().any():
    dup = df.columns[df.columns.duplicated()].tolist()
    raise ValueError(f"Duplicate columns in Excel: {dup}\nAll columns: {list(df.columns)}")


# build lookup from existing image filenames
img_files = [f for f in os.listdir(PRODUCT_DIR) if f.lower().endswith((".png",".jpg",".jpeg",".bmp",".gif"))]
img_lookup = {norm(os.path.splitext(f)[0]): f for f in img_files}

# attach image filename to each row
df["ProductFilePath"] = df["product_ENG"].apply(lambda x: img_lookup.get(norm(x), None))

missing = df[df["ProductFilePath"].isna()]["product_ENG"].tolist()
if missing:
    raise FileNotFoundError(f"Missing product images for these product_ENG names: {missing}")
    
# build trial rows WITH variables from excel
required_cols = ["product_ENG", "product_KOR", "genre", "classification", "price_range"]
missing_cols = [c for c in required_cols if c not in df.columns]
if missing_cols:
    raise ValueError(f"Excel missing columns: {missing_cols}")

rows = df[["ProductFilePath", "product_ENG", "product_KOR", "genre", "classification", "price_range"]].to_dict("records")

# constrained random order: no more than 2 in a row for each variable
rows = constrained_shuffle(rows, max_run=2)

#rows = rows[:8]   # ✅ test run

# mapping each information type to its corresponding numeric file code
info_code_map = {
    'expert': '01',
    'consensus': '02',
    'peer': '03',
    'gpt': '04'
}
info_types = list(info_code_map.keys())

info_assignment = assign_info_types_balanced(
    rows=rows,
    info_types=info_types,
    max_run=2,
    seed=None
)

# create trials (sequential because rows already randomized)
trials = data.TrialHandler(rows, nReps=1, method="sequential")

#distribute info type evenly
num_products = len(trials.trialList)
num_info_types = len(info_types)

# Repeat and trim the info_types list to match the number of trials
balanced_info_types = (info_types * (num_products // num_info_types + 1))[:num_products]
balanced_info_types = constrained_shuffle_1d(balanced_info_types, max_run=2)


# Map question names -> functions
QUESTION_FUNCS = {
    "credibility_EX": showCredibilityEX,
    "credibility_CON": showCredibilityCON,
    "credibility_PEER": showCredibilityPEER,
    "credibility_general": showCredibilityGEN,
    "preference": showPreference
}

def is_valid_position_runs(order_history, candidate_order, max_run=3):
    if not order_history:
        return True

    n_positions = len(candidate_order)

    for pos in range(n_positions):
        run = 1
        for prev_order in reversed(order_history):
            if prev_order[pos] == candidate_order[pos]:
                run += 1
            else:
                break
        if run > max_run:
            return False

    return True


def build_balanced_orders_with_position_constraint(all_orders, n_trials, max_run=3, max_tries=5000, seed=None):
    rng = random.Random(seed)

    for _ in range(max_tries):
        if n_trials <= len(all_orders):
            pool = rng.sample(all_orders, n_trials)
        else:
            pool = []
            while len(pool) < n_trials:
                chunk = list(all_orders)
                rng.shuffle(chunk)
                pool.extend(chunk)
            pool = pool[:n_trials]

        arranged = []
        remaining = list(pool)

        while remaining:
            valid_candidates = [o for o in remaining if is_valid_position_runs(arranged, o, max_run=max_run)]

            if not valid_candidates:
                break

            chosen = rng.choice(valid_candidates)
            arranged.append(chosen)
            remaining.remove(chosen)

        if len(arranged) == n_trials:
            return arranged

    raise RuntimeError("Could not build question orders with the position-run constraint.")

# All 6 possible orders of 3 questions
ALL_ORDERS = list(itertools.permutations([
    "credibility_EX", "credibility_CON", "credibility_PEER",
    "credibility_general", "preference"]))  # 6 tuples

# Create a balanced list of orders for the whole experiment
n_trials = len(trials.trialList)
balanced_orders = build_balanced_orders_with_position_constraint(
    ALL_ORDERS,
    n_trials,
    max_run=3,
    seed=None
)


def flush_csvs():
    # ---- RESULTS ----
    results_path = os.path.join(out_dir, f"Results{ID}.csv")
    if results_rows:
        pd.DataFrame(results_rows).to_csv(
            results_path,
            index=False,
            encoding="utf-8-sig",
            quoting=csv.QUOTE_ALL,
            lineterminator="\n"
        )
    else:
        pd.DataFrame().to_csv(
            results_path,
            index=False,
            encoding="utf-8-sig",
            quoting=csv.QUOTE_ALL,
            lineterminator="\n"
        )

    # ---- TIMING ----
    timing_path = os.path.join(out_dir, f"TimingRaw_{ID}.csv")
    if event_log:
        pd.DataFrame(event_log).to_csv(
            timing_path,
            index=False,
            encoding="utf-8-sig",
            quoting=csv.QUOTE_ALL,
            lineterminator="\n"
        )


try:
    showIntro()
    showFixation(3)
    
    for t_idx, trial in enumerate(trials, start=1):

        # ---- run the trial as usual ----
        pst, pet = showProduct(trial['ProductFilePath'])
        log_event(ID, t_idx, "product", trial['ProductFilePath'], pst, pet)

        fst, fet = showFixation()
        log_event(ID, t_idx, "fixation", "fixation.png", fst, fet)

        product_name = os.path.splitext(trial['ProductFilePath'])[0]

        random_info_type = info_assignment[t_idx - 1]   # stable per-trial mapping
        suffix = info_code_map[random_info_type]
        info_filename = f"{product_name}_{suffix}.png"

        ist, iet = showInfo(info_filename)
        log_event(ID, t_idx, "info", info_filename, ist, iet)

        fst, fet = showFixation()
        log_event(ID, t_idx, "fixation", "fixation.png", fst, fet)

        q_order = balanced_orders[t_idx - 1]
        
        # ✅ GPT일 때만 3개 질문 유지
        if random_info_type == "gpt":
            q_order = q_order
        else:
            # GPT가 아닐 때는 해당 3개 질문 제거
            q_order = [q for q in q_order if q not in ["credibility_EX", "credibility_CON", "credibility_PEER"]]

        results = {}  # store responses

        for qname in q_order:
            score, rt, st, et, duration = QUESTION_FUNCS[qname](random_info_type)
            results[qname] = {"score": score, "rt": rt}
            log_event(ID, t_idx, "question", qname, st, et, rt=rt)

            fst, fet = showFixation()
            log_event(ID, t_idx, "fixation", "fixation.png", fst, fet)

        # ✅ build ONE flat row for this trial
        row = {
            "TrialNumber": t_idx,
            "ProductFilePath": trial["ProductFilePath"],
            "product_ENG": trial["product_ENG"],
            "product_KOR": trial["product_KOR"],
            "genre": trial["genre"],
            "classification": trial["classification"],
            "price_range": trial["price_range"],
            "InfoType": random_info_type,
            "Q_Order": "-".join(q_order),

            "Credibility_EX": results.get("credibility_EX", {}).get("score", ""),
            "Credibility_CON": results.get("credibility_CON", {}).get("score", ""),
            "Credibility_PEER": results.get("credibility_PEER", {}).get("score", ""),
            "Credibility_general": results.get("credibility_general", {}).get("score", ""),
            "Preference": results.get("preference", {}).get("score", ""),
            "Credibility_EX_RT": results.get("credibility_EX", {}).get("rt",""),
            "Credibility_CON_RT": results.get("credibility_CON", {}).get("rt",""),
            "Credibility_PEER_RT": results.get("credibility_PEER", {}).get("rt",""),
            "Credibility_general_RT": results.get("credibility_general", {}).get("rt",""),
            "Preference_RT": results.get("preference", {}).get("rt",""),
        }

        results_rows.append(row)     # ✅ commit “for real”
        flush_csvs()                 # ✅ overwrite ONE file with everything so far

        # crash-safe checkpoint (optional)
        with open(os.path.join(out_dir, f"checkpoint_{ID}.pkl"), "wb") as f:
            pickle.dump({"rows": results_rows, "event_log": event_log}, f)

except KeyboardInterrupt:
    pass

finally:
    flush_csvs()
    with open(os.path.join(out_dir, f"checkpoint_{ID}.pkl"), "wb") as f:
        pickle.dump({"rows": results_rows, "event_log": event_log}, f)
    win.close()
    core.quit()

    

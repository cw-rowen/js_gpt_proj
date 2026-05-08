import os, re, csv, pickle, random, itertools
import numpy as np
import pandas as pd
from collections import defaultdict
from PIL import Image

from psychopy import visual, event, core, data, gui

# ─────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────

CFG = dict(
    product_xl   = "product_list.xlsx",     # alt: use product_list_32.xlsx
    stim_root      = "stim",                # alt: use stim_32
    results_root   = "pilot_results",
    
    # debug menu
    debug          = False,      # debug mode has faster timing and forces only one endorsement type
    debug_info_type = "expert",    # change to: "expert" | "consensus" | "peer" | "gpt"

    # timing 
    product_dur    = 4.0,       # secs that the product is shown 
    info_dur       = 9.0,       # secs that the endorsement is shown
    fix_min        = 0.5,       # fixation jitter range
    fix_max        = 1.5,

    # randomization parameters
    max_run        = 2,         # max consecutive: same condition
    question_order_max_run = 3, # max consecutive: same question appearing in the same position

    # window
    full_screen    = True,
    bg_color       = "black",
    units          = "norm",    # norm units: -1.0 to +1.0
    use_retina     = True,      # overridden by startup dialog (True for Mac, False for Windows)

    # text (heights in "height" units)
    font               = "NanumGothic", 
    text_height_big    = 0.15,       # endorsement source label 
    text_height_medium = 0.045,     # Likert scale numbers 
    text_height_small  = 0.05,      # Likert endpoint descriptions 
    text_bold          = True,
    text_color         = "white",

    # scale  – ALL scale elements use "height" units
    scale_n        = 7,         # number of scale points 
    circle_radius  = 0.065,     # radius of each circle
    scale_y        = -0.15,     # vertical centre of circles
    numbers_y        = -0.27,     # pos. of Likert scale numbers 
    desc_y         = -0.35,     # pos. of Likert endpoint descriptions
    label_x        = -0.75,        # pos. of endorsement source label 
    label_y        = 0.75,         
    scale_x_left   = -0.6,      # pos. of leftmost circle 
    scale_x_right  =  0.6,      # pos. of rightmost circle 

)

INFO_CODE_MAP = {
    "expert":    "01",      # dictionary
    "consensus": "02",
    "peer":      "03",
    "gpt":       "04",
}

INFO_LABEL_MAP = {
    #expert is handled separately       # dictionary for labels 
    "consensus": "[소비자 의견 종합]",
    # peer is handled separately 
    "gpt":       "[ChatGPT]",
}


# ─────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────

global_clock  = core.Clock()
event_log     = []
event_counter = 0
results_rows  = []

# normalize a string
def norm(s):
    s = str(s).strip().lower()      
    return re.sub(r"\s+", " ", s)  

# periodically check for "ESC" input
def checked_wait(seconds):
    t0 = global_clock.getTime()
    while (global_clock.getTime() - t0) < seconds:
        if event.getKeys(["escape"]):
            raise KeyboardInterrupt
        core.wait(0.01)

# append one row to event_log 
def log_event(ID, trial_index, event_type, stim_name, start_t, end_t, rt=None):
    global event_counter
    event_counter += 1

    # duration only for non-question events 
    duration = "" if event_type == "question" else (
        (end_t - start_t) if (start_t is not None and end_t is not None) else ""
    )

    # RT only for question events 
    if event_type != "question":
        rt = ""

    event_log.append(dict(
        ID=ID, Trial=trial_index, EventN=event_counter,
        EventType=event_type, StimName=stim_name,
        StartTime=start_t, EndTime=end_t,
        Duration=duration, RT=rt,
    ))

# writes results in csv 
def flush_csvs(out_dir, ID):
    def _write(path, rows):
        pd.DataFrame(rows if rows else []).to_csv(
            path, index=False, encoding="utf-8-sig",
            quoting=csv.QUOTE_ALL, lineterminator="\n"
        )
    _write(os.path.join(out_dir, f"Results_{ID}.csv"),   results_rows)
    _write(os.path.join(out_dir, f"Timing_{ID}.csv"),    event_log)


# ─────────────────────────────────────────────
#  WINDOW 
# ─────────────────────────────────────────────

def make_window(use_retina=None):
    if use_retina is None:
        use_retina = CFG["use_retina"]
    win = visual.Window(
        fullscr   = CFG["full_screen"],
        screen    = 0,
        color     = CFG["bg_color"],
        units     = CFG["units"],       # "norm" units 
        allowGUI  = False,
        winType   = "pyglet",
        useRetina = use_retina,
    )
    win.mouseVisible = False
    return win


# ─────────────────────────────────────────────
#  IMAGE HELPER (replaces fit_size_to_window)
# ─────────────────────────────────────────────

# returns ImageStim scaled to fill the window while preserving aspect ratio
# more dynamic than pixel size 
def make_image_stim(win, path):
    iw, ih = Image.open(path).size
    ww, wh = win.size                           # win.size is in pixels
    scale = min(ww / iw, wh / ih)
    w_norm = (iw * scale / ww) * 2          # convert pixel size to norm units
    h_norm = (ih * scale / wh) * 2
    stim = visual.ImageStim(win, image=path, pos=(0, 0), size=(w_norm, h_norm), units="norm")
    return stim

# returns string for the endorser label
def resolve_label(info_type, peer_name=None, expert_label=None):
    if info_type == "peer":
        return f"[{peer_name}의 추천]" if peer_name else None
    if info_type == "expert":
        return expert_label or INFO_LABEL_MAP.get("expert")
    return INFO_LABEL_MAP.get(info_type)          # consensus, gpt, or None

# makes the text for the endorser label 
def make_info_label(win, label_text):
    if not label_text:
        return None
    return visual.TextStim(
        win, text=label_text, pos=(CFG["label_x"], CFG["label_y"]),
        height=CFG["text_height_big"], color=CFG["text_color"], font="NanumGothic",
        bold=True, alignText="left", anchorHoriz="left",
        anchorVert="top", units="norm"
    )


# ─────────────────────────────────────────────
#  LIKERT SCALE HELPER  (optimization of Qs)
# ─────────────────────────────────────────────

# reusable 7-point Likert scale 
class LikertScale:

    def __init__(self, win, left_label="", right_label=""):
        font   = CFG["font"]
        n      = CFG["scale_n"]
        xs     = np.linspace(CFG["scale_x_left"], CFG["scale_x_right"], n)
        sy     = CFG["scale_y"]
        ly     = CFG["numbers_y"]
        dy     = CFG["desc_y"]
        r      = CFG["circle_radius"]
        h_med  = CFG["text_height_medium"]
        h_sml  = CFG["text_height_small"]
        bold   = CFG["text_bold"]
        col    = CFG["text_color"]

        self.circles = [
            visual.Circle(win, radius=r, edges=64,
                          pos=(x, sy), lineColor=col, lineWidth=4,
                          units="height")
            for x in xs
        ]
        self.numbers = [
            visual.TextStim(win, text=str(i + 1), pos=(xs[i], ly),
                            height=h_med, color=col, font=font, bold=bold,
                            alignText="center", units="height")
            for i in range(n)
        ]
        
        
        self.left_desc = visual.TextStim(
            win, text=left_label,
            pos=(CFG["scale_x_left"]-2*r, dy),
            height=h_sml, color=col, font=font, bold=bold,
            alignText="left", anchorHoriz="left",
            units="height"
        ) if left_label else None

        self.right_desc = visual.TextStim(
            win, text=right_label,
            pos=(CFG["scale_x_right"]+2*r, dy),
            height=h_sml, color=col, font=font, bold=bold,
            alignText="right", anchorHoriz="right",
            units="height"
        ) if right_label else None


        self.current = None   # index of selected circle

    def reset(self):
        self.current = None

    def draw(self):
        for i, (c, n) in enumerate(zip(self.circles, self.numbers)):
            # make the selected circle red
            c.fillColor = "red" if self.current == i else None 
            c.draw()
            n.draw()
        if self.left_desc:
            self.left_desc.draw()
        if self.right_desc:
            self.right_desc.draw()

    def handle_key(self, key):
        # update selected circle using arrow keys
        n = CFG["scale_n"]
        if key == "left":
            self.current = (n // 2) if self.current is None else max(0, self.current - 1)
        elif key == "right":
            self.current = (n // 2) if self.current is None else min(n - 1, self.current + 1)
        elif key == "return" and self.current is not None:
            return True
        return False


# ─────────────────────────────────────────────
#  SCREEN FUNCTIONS
# ─────────────────────────────────────────────

def show_intro(win, path):
    stim = make_image_stim(win, path)
    while True:
        stim.draw()
        win.flip()
        keys = event.waitKeys(keyList=["space", "return", "escape"])
        if "escape" in keys:
            raise KeyboardInterrupt
        if "space" in keys or "return" in keys:
            return

# shows an image for a fixed duration. returns start and end times. 
#   replaces the functions showProduct & showInfo  
def show_image_timed(win, path, duration, label_text=None):
    stim = make_image_stim(win, path)
    label_stim = make_info_label(win, label_text) if label_text else None
    start_t = global_clock.getTime()
    while (global_clock.getTime() - start_t) < duration:
        stim.draw()
        if label_stim: label_stim.draw()
        win.flip()
        if event.getKeys(["escape"]): raise KeyboardInterrupt
        core.wait(0.005)
    return start_t, global_clock.getTime()


def show_fixation(win, mindur=None, maxdur=None):
    mindur = mindur or CFG["fix_min"]
    maxdur = maxdur or CFG["fix_max"]
    duration = np.random.uniform(mindur, maxdur)
    path = os.path.join(CFG["stim_root"], "00_fixation", "fixation.png")

    stim = make_image_stim(win, path)
    stim.draw()

    start_t = global_clock.getTime()
    win.flip()
    checked_wait(duration)
    end_t = global_clock.getTime()
    return start_t, end_t

# shows question, waits for key events 
#   replaces the functions showCredibility(EX/CON/PEER/GEN) & showPreference
def show_question(win, bg_path, scale, label_text=None):
    bg = make_image_stim(win, bg_path)
    label_stim = make_info_label(win, label_text) if label_text else None
    scale.reset()
    start_t = None
    while True:
        bg.draw()
        if label_stim: label_stim.draw()
        scale.draw()
        event.clearEvents(eventType='keyboard')
        if start_t is None: start_t = global_clock.getTime()
        win.flip()
        keys = event.waitKeys(keyList=["left", "right", "return", "escape"], timeStamped=global_clock, clearEvents=False)
        for key, ts in keys:
            if key == "escape": raise KeyboardInterrupt
            if scale.handle_key(key):
                return scale.current + 1, ts - start_t, start_t, global_clock.getTime()
            
            
# ─────────────────────────────────────────────
#  QUESTION DEFINITIONS
# ─────────────────────────────────────────────

QUESTION_DEFS = {
    "credEX": dict(
        bg       = "credibility_EX.png",
        left     = "전혀 전문적이지 않다",
        right    = "매우 전문적이다",
        title    = None
    ),
    "credCON": dict(
        bg       = "credibility_CON.png",
        left     = "전혀 반영하지 않는다",
        right    = "매우 반영한다",
        title    = None
    ),
    "credPEER": dict(
        bg       = "credibility_PEER.png",
        left     = "전혀 가깝지 않다",
        right    = "매우 가깝다",
        title    = None
    ),
    "credGen": dict(
        bg       = "credibility_general.png",
        left     = "전혀 믿지 않음",
        right    = "매우 신뢰함",
        title    = None
    ),
    "preference": dict(
        bg       = "preference.png",
        left     = "전혀 선호하지 않음",
        right    = "매우 선호함",
        title    = None
    ),
}

# questions shown per endorser type:
#   GPT = all 4 credibility Qs & preference
GPT_QUESTIONS   = ["credEX", "credCON", "credPEER",
                   "credGen", "preference"]
#   human endorsers = credibilityGeneral & preference 
OTHER_QUESTIONS = ["credGen", "preference"]


def run_question(win, qname, scales, label_text=None):
    q = QUESTION_DEFS[qname]
    bg = os.path.join(CFG["stim_root"], "03_question", q["bg"])
    return show_question(win, bg, scales[qname], label_text=label_text)



# ─────────────────────────────────────────────
#  RANDOMIZATION HELPERS
# ─────────────────────────────────────────────

# randomize info order (also accounts for is_valid_order)
def is_valid_run(seq, max_run):
    run = 1
    for i in range(1, len(seq)):
        if seq[i] == seq[i - 1]:
            run += 1
            if run > max_run:
                return False
        else:
            run = 1
    return True

# shuffle rows (also accounts for constrained_shuffle_1d)
def constrained_shuffle(rows, key_fn, max_run=2, max_tries=20000, seed=None):
    rng = random.Random(seed)
    rows = list(rows)
    for _ in range(max_tries):
        rng.shuffle(rows)
        # key_fn allows this function to account for both trial rows and flat lists 
        seq = [key_fn(r) for r in rows]
        if is_valid_run(seq, max_run):
            return rows
    raise RuntimeError("Could not find a valid randomized order.")

# makes sure no more than "max_run" consecutive trials get the same endorser type 
def assign_info_types_balanced(rows, info_types, max_run=2, seed=None, max_tries=5000):
    rng = random.Random(seed)

    def combo(r):
        return (r["genre"], r["classification"], r["price_range"])

    n = len(rows)
    combos = [combo(r) for r in rows]

    # targets: overall each info appears ~ n/len(info_types)
    # (we use greedy "keep counts minimal" rather than hard targets — more flexible)
    for _ in range(max_tries):
        overall   = defaultdict(int)
        per_combo = defaultdict(lambda: defaultdict(int))
        assigned  = []
        ok = True

        for i in range(n):
            ck = combos[i]
            # candidate types filtered by run rule
            candidates = list(info_types)
            if len(assigned) >= max_run and all(x == assigned[-1] for x in assigned[-max_run:]):
                # last max_run are identical -> can't choose that same type again
                candidates = [t for t in candidates if t != assigned[-1]]
            if not candidates:
                ok = False; break

            # score candidates: prefer the ones with smallest per-combo count, then smallest overall count
            # randomness to break ties
            scored = [(per_combo[ck][t], overall[t], rng.random(), t) for t in candidates]
            scored.sort()
            chosen = scored[0][3]

            assigned.append(chosen)
            overall[chosen] += 1
            per_combo[ck][chosen] += 1

        if ok:
            return assigned

    raise RuntimeError("Could not assign InfoTypes satisfying constraints. Try higher max_tries or relax constraints.")

# check whether adding "candidate" to the question order will violate the max position run constraint
def is_valid_position_runs(history, candidate, max_run=3):
    for pos in range(len(candidate)):
        run = 1
        for prev in reversed(history):
            if prev[pos] == candidate[pos]:
                run += 1
            else:
                break
        if run > max_run:
            return False
    return True

# build a sequence of "n_trials" question orders, drawn from "all_orders"
#   called twice in main(): 
#       once for GPT_QUESTIONS (120 permutations of 5 questions)
#       once for OTHER_QUESTIONS (2 permutations of 2 questions)
def build_balanced_question_orders(all_orders, n_trials, max_run=3, max_tries=5000, seed=None):
    rng = random.Random(seed)
    for _ in range(max_tries):
        pool = []
        while len(pool) < n_trials:
            chunk = list(all_orders)
            rng.shuffle(chunk)
            pool.extend(chunk)
        pool = pool[:n_trials]

        arranged, remaining = [], list(pool)
        while remaining:
            valid_candidates = [o for o in remaining if is_valid_position_runs(arranged, o, max_run)]
            if not valid_candidates:
                break
            chosen = rng.choice(valid_candidates)
            arranged.append(chosen)
            remaining.remove(chosen)

        if len(arranged) == n_trials:
            return arranged

    raise RuntimeError("Could not build question orders with the position-run constraint.")


# ─────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────

def main():
    startup = {
        "Participant ID":   "",
        "Peer 1":           "Peer1",
        "Peer 2":           "Peer2",
        "Peer 3":           "Peer3",
        "Peer 4":           "Peer4",
        "Use Retina (Mac)": ["Yes", "No"],   # drop-down; first item is the default
    }
    dlg = gui.DlgFromDict(
        startup,
        title = "Session Setup",
        order = ["Participant ID", "Peer 1", "Peer 2", "Peer 3", "Peer 4",
                 "Use Retina (Mac)"],
    )
    if not dlg.OK:
        core.quit()
 
    # ── validate ID ───────────────────────────────
    ID = str(startup["Participant ID"]).strip()
    if not ID:
        d = gui.Dlg(title="Error")
        d.addText("Participant ID cannot be empty.")
        d.show(); core.quit()
 
    out_dir = os.path.join(CFG["results_root"], ID)
    if os.path.exists(out_dir):
        d = gui.Dlg(title="ID already exists")
        d.addText(f"ID '{ID}' already exists. Choose a new ID.")
        d.show(); core.quit()
 
    os.makedirs(out_dir, exist_ok=False)
 
    # ── validate and save peer names ──────────────
    peer_names = [str(startup[f"Peer {i}"]).strip() for i in range(1, 5)]
    if any(n == "" for n in peer_names):
        d = gui.Dlg(title="Error")
        d.addText("All four peer name fields must be filled in.")
        d.show(); core.quit()
 
    with open(os.path.join(out_dir, f"PeerNames_{ID}.txt"), "w", encoding="utf-8") as f:
        for i, name in enumerate(peer_names, 1):
            f.write(f"이름 {i}: {name}\n")
 

    # ── retina setting from dialog ────────────────
    use_retina = (startup["Use Retina (Mac)"] == "Yes")
 
    # ── resolve debug-mode timings ────────────────
    # In debug mode, override durations with fast values for rapid testing.
    if CFG["debug"]:
        product_dur = 1.0
        info_dur    = 1.0
        fix_min     = 0.1
        fix_max     = 0.2
    else:
        product_dur = CFG["product_dur"]
        info_dur    = CFG["info_dur"]
        fix_min     = CFG["fix_min"]
        fix_max     = CFG["fix_max"]
 

    # ── window ────────────────────────────────────
    win  = make_window(use_retina=use_retina)
 

    # ── build scales once (reused every trial) ───
    scales = {
        "credEX":       LikertScale(win, "전혀 전문적이지 않다", "매우 전문적이다"),
        "credCON":      LikertScale(win, "전혀 반영하지 않는다", "매우 반영한다"),
        "credPEER":     LikertScale(win, "전혀 가깝지 않다", "매우 가깝다"),
        "credGen":      LikertScale(win, "전혀 믿지 않음", "매우 신뢰함"),
        "preference":   LikertScale(win, "전혀 선호하지 않음", "매우 선호함"),
    }


    # ── load product list ─────────────────────────
    df = pd.read_excel(CFG["product_xl"])
    if df.columns.duplicated().any():
        raise ValueError(f"Duplicate columns in Excel: {df.columns[df.columns.duplicated()].tolist()}")

    product_dir = os.path.join(CFG["stim_root"], "01_product")
    img_files   = [f for f in os.listdir(product_dir)
                   if f.lower().endswith((".png", ".jpg", ".jpeg", ".bmp", ".gif"))]
    img_lookup  = {norm(os.path.splitext(f)[0]): f for f in img_files}

    df["ProductFilePath"] = df["product_ENG"].apply(
        lambda x: img_lookup.get(norm(x), None)
    )
    missing = df[df["ProductFilePath"].isna()]["product_ENG"].tolist()
    if missing:
        raise FileNotFoundError(f"Missing product images for: {missing}")


    # ── load expert labels ────────────────────────
    expert_df = pd.read_csv(
    os.path.join(CFG["stim_root"], "02_information", "expert_labels.csv"),
    header=None, names=["product", "expert"]
    )
    expert_label_map = {
        norm(row["product"]): row["expert"].strip()
        for _, row in expert_df.iterrows()
    }   
    missing_experts = [r["product_ENG"] for _, r in df.iterrows()
                   if norm(r["product_ENG"]) not in expert_label_map]
    if missing_experts:
        raise ValueError(f"No expert label found for: {missing_experts}")

    # ── validate required Excel columns ───────────
    required_cols = ["product_ENG", "product_KOR", "genre", "classification", "price_range"]
    missing_cols = [c for c in required_cols if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Excel missing columns: {missing_cols}")


    # ── build trial rows ──────────────────────────
    rows = df[["ProductFilePath", "product_ENG", "product_KOR",
               "genre", "classification", "price_range"]].to_dict("records")

    #   shuffle trials 
    rows = constrained_shuffle(
        rows,
        key_fn  = lambda r: (r["genre"], r["classification"], r["price_range"]),
        max_run = CFG["max_run"],
    )


    # ── set up PsychoPy TrialHandler ──────────────
    trials  = data.TrialHandler(rows, nReps=1, method="sequential")
    n_trials = len(trials.trialList)


    # ── assign info types ─────────────────────────
    info_types = list(INFO_CODE_MAP.keys())

    if CFG["debug"]:
        # Validate debug_info_type
        debug_type = CFG["debug_info_type"]
        if debug_type not in info_types:
            raise ValueError(
                f"CFG['debug_info_type'] must be one of {info_types}, got '{debug_type}'"
            )
        info_assignment = [debug_type] * n_trials
    else:
        info_assignment = assign_info_types_balanced(
            rows, info_types, max_run=CFG["max_run"]
        )


    # ── build balanced question order pools ───────
    ALL_ORDERS_GPT   = list(itertools.permutations(GPT_QUESTIONS))
    ALL_ORDERS_OTHER = list(itertools.permutations(OTHER_QUESTIONS))

    balanced_orders_gpt   = build_balanced_question_orders(
        ALL_ORDERS_GPT,   n_trials, max_run=CFG["question_order_max_run"]
    )
    balanced_orders_other = build_balanced_question_orders(
        ALL_ORDERS_OTHER, n_trials, max_run=CFG["question_order_max_run"]
    )
    gpt_counter   = 0
    other_counter = 0

 # ── run ───────────────────────────────────────
    try:
        intro_path = os.path.join(CFG["stim_root"], "04_intro", "intro.png")
        show_intro(win, intro_path)
        show_fixation(win, mindur=3, maxdur=3)

        for t_idx, trial in enumerate(trials, start=1):
            prod_path = os.path.join(product_dir, trial["ProductFilePath"])

            # product (no label during product display)
            pst, pet = show_image_timed(win, prod_path, product_dur)
            log_event(ID, t_idx, "product", trial["ProductFilePath"], pst, pet)

            # fixation
            fst, fet = show_fixation(win, mindur=fix_min, maxdur=fix_max)
            log_event(ID, t_idx, "fixation", "fixation.png", fst, fet)

            # endorser info
            info_type    = info_assignment[t_idx - 1]
            peer_name  = random.choice(peer_names) if info_type == "peer" else None
            expert_label = expert_label_map.get(norm(trial["product_ENG"])) if info_type == "expert" else None
            label_text = resolve_label(info_type, peer_name, expert_label)   # ← one value from here on

            suffix       = INFO_CODE_MAP[info_type]
            product_stem = os.path.splitext(trial["ProductFilePath"])[0]
            info_fname   = f"{product_stem}_{suffix}.png"
            info_path    = os.path.join(CFG["stim_root"], "02_information", info_fname)

            ist, iet = show_image_timed(win, info_path, info_dur, label_text=label_text)
            log_event(ID, t_idx, "info", info_fname, ist, iet)

            # fixation
            fst, fet = show_fixation(win, mindur=fix_min, maxdur=fix_max)
            log_event(ID, t_idx, "fixation", "fixation.png", fst, fet)

            # pick question order from the appropriate pool
            if info_type == "gpt":
                q_order = list(balanced_orders_gpt[gpt_counter % len(balanced_orders_gpt)])
                gpt_counter += 1
            else:
                q_order = list(balanced_orders_other[other_counter % len(balanced_orders_other)])
                other_counter += 1

            results = {}
            for qname in q_order:
                score, rt, st, et = run_question(win, qname, scales,label_text=label_text)
                results[qname] = {"score": score, "rt": rt}
                log_event(ID, t_idx, "question", qname, st, et, rt=rt)

                fst, fet = show_fixation(win, mindur=fix_min, maxdur=fix_max)
                log_event(ID, t_idx, "fixation", "fixation.png", fst, fet)

            # save row
            def g(k):  return results.get(k, {}).get("score", "")
            def grt(k): return results.get(k, {}).get("rt", "")

            results_rows.append(dict(
                TrialNumber         = t_idx,
                ProductFilePath     = trial["ProductFilePath"],
                product_ENG         = trial["product_ENG"],
                product_KOR         = trial["product_KOR"],
                genre               = trial["genre"],
                classification      = trial["classification"],
                price_range         = trial["price_range"],
                InfoType            = info_type,
                Q_Order             = "-".join(q_order),
                Credibility_EX      = g("credEX"),
                Credibility_CON     = g("credCON"),
                Credibility_PEER    = g("credPEER"),
                Credibility_general = g("credGen"),
                Preference          = g("preference"),
                Credibility_EX_RT   = grt("credEX"),
                Credibility_CON_RT  = grt("credCON"),
                Credibility_PEER_RT = grt("credPEER"),
                Credibility_general_RT = grt("credGen"),
                Preference_RT       = grt("preference"),
            ))
            flush_csvs(out_dir, ID)

            #crash-safe checkpoint (optional)
            with open(os.path.join(out_dir, f"checkpoint_{ID}.pkl"), "wb") as f:
                pickle.dump({"rows": results_rows, "event_log": event_log}, f)

    except KeyboardInterrupt:
        pass

    finally:
        flush_csvs(out_dir, ID)
        with open(os.path.join(out_dir, f"checkpoint_{ID}.pkl"), "wb") as f:
            pickle.dump({"rows": results_rows, "event_log": event_log}, f)
        win.close()
        core.quit()


# entry point guard 
if __name__ == "__main__":
    import traceback
    try:
        main()
    except Exception as e:
        with open("crash_log.txt","w") as f:
            traceback.print_exc(file=f)
        raise

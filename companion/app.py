"""Pokemon-Text Companion — a read-only inspector for the game's data files.

Reads the game's JSON data (../repo/data by default; override with the
POKEMON_TEXT_DIR environment variable pointing at the repo folder).
Never writes to the game. Run:  streamlit run app.py
"""
import json
import os
import re
from collections import Counter, deque
from pathlib import Path

import pandas as pd
import streamlit as st

_APP_DIR = Path(__file__).resolve().parent


def _find_repo():
    """Locate the game repo in either layout:
    dev workspace (companion/ sits beside repo/) or in-repo (companion/ inside the repo)."""
    env = os.environ.get("POKEMON_TEXT_DIR")
    if env:
        return Path(env).resolve()
    for cand in (_APP_DIR.parent / "repo", _APP_DIR.parent, _APP_DIR):
        if (cand / "data" / "routes.json").exists():
            return cand.resolve()
    return (_APP_DIR.parent / "repo").resolve()


REPO = _find_repo()
DATA = REPO / "data"
_REPORT_CANDIDATES = [REPO.parent / "playtest" / "report.json", _APP_DIR / "report.json"]
REPORT = next((p for p in _REPORT_CANDIDATES if p.exists()), _REPORT_CANDIDATES[0])

st.set_page_config(page_title="Pokemon-Text Companion", layout="wide")


@st.cache_data
def load(name):
    with open(DATA / name, encoding="utf-8") as f:
        return json.load(f)


@st.cache_data
def load_report():
    if REPORT.exists():
        with open(REPORT, encoding="utf-8") as f:
            return json.load(f)
    return None


def load_all():
    return {
        "routes": load("routes.json"),
        "trainers": load("trainers.json"),
        "npcs": load("npcs.json"),
        "pokemon": load("pokemon.json"),
        "items": load("items.json"),
        "moves": load("moves.json"),
        "shops": load("shops.json"),
        "gyms": load("gyms.json"),
    }


D = load_all()
ROUTES, TRAINERS, NPCS = D["routes"], D["trainers"], D["npcs"]
POKEMON, ITEMS, MOVES, SHOPS, GYMS = D["pokemon"], D["items"], D["moves"], D["shops"], D["gyms"]
POKE_BY_NAME = {p["name"]: pid for pid, p in POKEMON.items()}
POKE_ANY = set(POKEMON.keys()) | set(POKE_BY_NAME.keys())  # data mixes ids and display names


def route_name(rid):
    return ROUTES.get(rid, {}).get("name", rid)


# ---------------------------------------------------------------- validation
def run_checks():
    """Returns list of (severity, area, where, message). severity: error|warn|info"""
    out = []

    def err(area, where, msg): out.append(("error", area, where, msg))
    def warn(area, where, msg): out.append(("warn", area, where, msg))

    # --- routes: connections exist, are two-way, encounters sane
    for rid, r in ROUTES.items():
        for c in r.get("connections", []):
            if c not in ROUTES:
                err("routes", rid, f"Connection to missing route '{c}'")
            elif rid not in ROUTES[c].get("connections", []):
                warn("routes", rid, f"One-way connection: {rid} -> {c} has no way back")
        for method, table in (r.get("encounters") or {}).items():
            if not table:
                continue
            total = sum(e.get("weight", 0) for e in table)
            if total != 100:
                warn("encounters", rid, f"{method} weights sum to {total}, not 100")
            for e in table:
                if e.get("species") not in POKE_ANY:
                    err("encounters", rid, f"{method}: unknown species '{e.get('species')}'")
                if e.get("min_level", 0) > e.get("max_level", 0):
                    err("encounters", rid, f"{method}: {e.get('species')} min_level > max_level")

    # --- trainers: known species/moves, non-empty parties, placed somewhere
    placed = set()
    for r in ROUTES.values():
        placed.update(r.get("trainers", []))
        for field in ("forced_battle", "enter_battle"):
            fb = r.get(field)
            if isinstance(fb, dict) and fb.get("trainer_id"):
                placed.add(fb["trainer_id"])
    for gym in GYMS.values():
        placed.add(gym.get("gym_leader"))
        placed.update(gym.get("gym_trainers", []))
    for tid, t in TRAINERS.items():
        party = t.get("party", [])
        if not party:
            err("trainers", tid, "Empty party")
        for m in party:
            sp = m.get("species", "")
            if sp not in POKEMON and not sp.startswith("RIVAL_"):
                err("trainers", tid, f"Unknown species '{sp}'")
            for mv in m.get("moves", []) or []:
                mid = mv.get("moveId") or mv.get("id") if isinstance(mv, dict) else mv
                if mid not in MOVES:
                    err("trainers", tid, f"Unknown move '{mid}'")
        if tid not in placed:
            warn("trainers", tid, "Not placed on any route or gym (orphan)")

    # --- NPCs: rewards/requirements reference real things
    def check_refs(owner, blob):
        for rw in blob.get("rewards", []) or []:
            if rw.get("type") == "item" and rw.get("id") not in ITEMS:
                err("npcs", owner, f"Reward item '{rw.get('id')}' not in items.json")
            if rw.get("type") == "pokemon" and rw.get("id") not in POKEMON:
                err("npcs", owner, f"Reward pokemon '{rw.get('id')}' not in pokemon.json")
        for rq in blob.get("requirements", []) or []:
            if rq.get("type") == "item" and rq.get("id") not in ITEMS:
                err("npcs", owner, f"Requirement item '{rq.get('id')}' not in items.json")

    for nid, n in NPCS.items():
        check_refs(nid, n)
        for stage in n.get("stages", []) or []:
            check_refs(nid, stage)

    # --- shops: every stocked item exists; every item with a price is stocked or gifted
    for shop_id, stock in SHOPS.items():
        for entry in stock:
            if isinstance(entry, dict):  # Game Corner prizes: {key, kind, ...}
                key, kind = entry.get("key"), entry.get("kind")
                if kind == "pokemon" and key not in POKEMON:
                    err("shops", shop_id, f"Prize pokemon '{key}' not in pokemon.json")
                elif kind != "pokemon" and key not in ITEMS:
                    err("shops", shop_id, f"Prize item '{key}' not in items.json")
            elif entry not in ITEMS:
                err("shops", shop_id, f"Stocks unknown item '{entry}'")

    # --- gyms: leader/trainers exist, reward items exist
    for gid, g in GYMS.items():
        for tid in [g.get("gym_leader")] + (g.get("gym_trainers", []) or []):
            if tid and tid not in TRAINERS:
                err("gyms", gid, f"Trainer '{tid}' not in trainers.json")
        for rw in g.get("rewards", []) or []:
            if rw.get("type") == "item" and rw.get("id") not in ITEMS:
                err("gyms", gid, f"Reward item '{rw.get('id')}' not in items.json")

    # --- index.html: duplicate element ids (the dead-Fight-button bug class)
    html_path = REPO / "index.html"
    if html_path.exists():
        ids = re.findall(r'id="([^"]+)"', html_path.read_text(encoding="utf-8"))
        for dup, n in Counter(ids).items():
            if n > 1:
                err("html", "index.html", f"Duplicate element id '{dup}' x{n} — getElementById only wires the first")

    return out


def bfs_distances():
    dist = {"pallet_town": 0}
    q = deque(["pallet_town"])
    while q:
        cur = q.popleft()
        for nxt in ROUTES.get(cur, {}).get("connections", []):
            if nxt in ROUTES and nxt not in dist:
                dist[nxt] = dist[cur] + 1
                q.append(nxt)
    return dist


# ---------------------------------------------------------------- pages
def page_overview():
    st.title("Pokémon-Text Companion")
    st.caption(f"Reading data from {DATA} — read-only, the game is never modified.")
    c = st.columns(4)
    c[0].metric("Routes", len(ROUTES))
    c[1].metric("Trainers", len(TRAINERS))
    c[2].metric("NPCs", len(NPCS))
    c[3].metric("Species in data", len(POKEMON))
    rep = load_report()
    if rep:
        s = rep["stats"]
        st.subheader("Latest playtest harness run")
        c = st.columns(4)
        c[0].metric("Obtainability", s["obtainability"]["verified"])
        c[1].metric("Badges", f"{s['badges']}/8")
        c[2].metric("Harness errors", len(rep["errors"]))
        c[3].metric("Static checks", s["staticChecks"])
        st.write(f"Routes visited {s['routesVisited']}, unvisited {len(s.get('routesUnvisited', []))}; "
                 f"trainers fought {s['trainersFought']}; Hall of Fame done: {s['hofDone']}.")
    else:
        st.info("No playtest report found (playtest/report.json) — obtainability page will be empty.")
    checks = run_checks()
    errs = [x for x in checks if x[0] == "error"]
    warns = [x for x in checks if x[0] == "warn"]
    st.subheader("Data health")
    st.write(f"**{len(errs)} errors**, **{len(warns)} warnings** from the validation checks. See the Validation page.")


def page_validation():
    st.title("Validation")
    st.caption("Static checks over the game's JSON + index.html. Errors are likely real bugs; warnings are worth a look.")
    checks = run_checks()
    if not checks:
        st.success("All checks pass. 🎉")
        return
    df = pd.DataFrame(checks, columns=["severity", "area", "where", "message"])
    sev = st.multiselect("Severity", ["error", "warn"], default=["error", "warn"])
    area = st.multiselect("Area", sorted(df["area"].unique()), default=sorted(df["area"].unique()))
    view = df[df["severity"].isin(sev) & df["area"].isin(area)]
    st.write(f"{len(view)} findings")
    st.dataframe(view, width="stretch", hide_index=True)
    # leftover [DRAFT] dialogue tracker
    st.subheader("Remaining [DRAFT] dialogue")
    rows = []
    for tid, t in TRAINERS.items():
        if "[DRAFT]" in json.dumps(t):
            rows.append(("trainer", tid, t.get("name", "")))
    for nid, n in NPCS.items():
        if "[DRAFT]" in json.dumps(n):
            rows.append(("npc", nid, n.get("name", "")))
    if rows:
        st.dataframe(pd.DataFrame(rows, columns=["kind", "id", "name"]), width="stretch", hide_index=True)
    else:
        st.write("None — all dialogue is final.")


def page_encounters():
    st.title("Encounters")
    tab1, tab2 = st.tabs(["By route", "Species finder"])
    with tab1:
        rid = st.selectbox("Route", sorted(ROUTES.keys()), format_func=route_name)
        enc = ROUTES[rid].get("encounters") or {}
        shown = False
        for method, table in enc.items():
            if not table:
                continue
            shown = True
            total = sum(e["weight"] for e in table) or 1
            rows = [{"Species": e["species"], "Levels": f"{e['min_level']}–{e['max_level']}",
                     "Weight": e["weight"], "Chance": f"{100*e['weight']/total:.0f}%"} for e in table]
            st.subheader(method.capitalize())
            st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)
        if not shown:
            st.write("No wild encounters here.")
    with tab2:
        names = sorted(POKE_BY_NAME.keys())
        species = st.selectbox("Species", names)
        rows = []
        for rid2, r in ROUTES.items():
            for method, table in (r.get("encounters") or {}).items():
                total = sum(e["weight"] for e in table) or 1
                for e in table:
                    disp = POKEMON.get(e["species"], {}).get("name", e["species"])
                    if disp == species:
                        rows.append({"Route": route_name(rid2), "Method": method,
                                     "Levels": f"{e['min_level']}–{e['max_level']}",
                                     "Chance": f"{100*e['weight']/total:.0f}%"})
        if rows:
            st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)
        else:
            st.write("No wild encounters — check the Obtainability page for gift/evolution sources.")


def page_balance():
    st.title("Balance")
    dist = bfs_distances()
    rows = []
    for rid, r in ROUTES.items():
        tids = r.get("trainers", [])
        levels, money = [], 0
        for tid in tids:
            t = TRAINERS.get(tid)
            if not t:
                continue
            levels += [m["level"] for m in t.get("party", [])]
            money += t.get("rewardMoney", 0)
        if tids:
            rows.append({"route": route_name(rid), "steps_from_pallet": dist.get(rid),
                         "trainers": len(tids), "avg_level": round(sum(levels)/len(levels), 1) if levels else 0,
                         "max_level": max(levels) if levels else 0, "money_available": money})
    df = pd.DataFrame(rows).sort_values("steps_from_pallet")
    st.subheader("Trainer strength by distance from Pallet Town")
    st.caption("Distance = fewest connections from Pallet Town — a rough progression proxy.")
    chart = df.dropna(subset=["steps_from_pallet"]).groupby("steps_from_pallet")["avg_level"].mean()
    st.line_chart(chart)
    st.dataframe(df, width="stretch", hide_index=True)
    st.subheader("Gyms")
    grows = []
    for gid, g in GYMS.items():
        leader = TRAINERS.get(g.get("gym_leader"), {})
        lv = [m["level"] for m in leader.get("party", [])]
        grows.append({"Gym": g.get("name", gid), "Leader": leader.get("name", g.get("gym_leader")),
                      "Leader party": len(lv), "Leader levels": f"{min(lv)}–{max(lv)}" if lv else "-",
                      "Gym trainers": len(g.get("gym_trainers", []) or [])})
    st.dataframe(pd.DataFrame(grows), width="stretch", hide_index=True)
    total_money = sum(t.get("rewardMoney", 0) for t in TRAINERS.values())
    st.metric("Total trainer money in the game", f"¥{total_money:,}")


def page_map():
    st.title("Route map")
    st.caption("Boxes = towns/cities, ellipses = routes/interiors. Red = gated by a flag.")
    show_labels = st.checkbox("Label gated routes with their flag", value=True)
    lines = ["digraph {"]
    lines.append('  rankdir=LR; node [fontsize=9, style=filled, fillcolor="#eef"];')
    for rid, r in ROUTES.items():
        shape = "box" if r.get("isTown") else "ellipse"
        gated = r.get("req_flag")
        color = "#f8d7da" if gated else "#eef"
        label = r.get("name", rid)
        if gated and show_labels:
            label += f"\\n[{gated}]"
        lines.append(f'  "{rid}" [label="{label}", shape={shape}, fillcolor="{color}"];')
    seen = set()
    for rid, r in ROUTES.items():
        for c in r.get("connections", []):
            key = tuple(sorted((rid, c)))
            if c in ROUTES and key not in seen:
                seen.add(key)
                lines.append(f'  "{rid}" -> "{c}" [dir=none];')
    lines.append("}")
    st.graphviz_chart("\n".join(lines), width="stretch")


def page_obtainability():
    st.title("Obtainability")
    rep = load_report()
    if not rep:
        st.info("No playtest report found at playtest/report.json. Run the harness to generate one.")
        return
    s = rep["stats"]
    ob = s["obtainability"]
    c = st.columns(3)
    c[0].metric("Verified obtainable", ob["verified"])
    c[1].metric("Badges", f"{s['badges']}/8")
    c[2].metric("Hall of Fame", "Done" if s["hofDone"] else "Not done")
    if ob.get("missing"):
        st.error("Missing species: " + ", ".join(ob["missing"]))
    else:
        st.success("No missing species — the full 151 are obtainable.")
    if ob.get("sourceless"):
        st.subheader("No direct source (reached by evolution etc.)")
        st.write(", ".join(sorted(ob["sourceless"])))
    if s.get("routesUnvisited"):
        st.subheader("Routes the crawler never reached")
        st.write(", ".join(sorted(s["routesUnvisited"])))
    if rep["errors"]:
        st.subheader("Harness errors")
        for e in rep["errors"]:
            st.write("- ", e)


PAGES = {
    "Overview": page_overview,
    "Validation": page_validation,
    "Encounters": page_encounters,
    "Balance": page_balance,
    "Route Map": page_map,
    "Obtainability": page_obtainability,
}

choice = st.sidebar.radio("Page", list(PAGES.keys()))
st.sidebar.caption("Read-only companion for Pokémon-Text. Data: repo/data/*.json")
PAGES[choice]()

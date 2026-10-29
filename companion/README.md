# Pokémon-Text Companion

A read-only Streamlit dashboard that inspects the Pokémon-Text game data.
It **never modifies the game** — it only reads the JSON files in `../data/`.

## Pages
- **Overview** — data counts, latest playtest-harness headline numbers, data-health summary
- **Validation** — static checks: broken connections, one-way routes, encounter
  weights that don't sum to 100, unknown species/moves/items in trainers, NPCs,
  shops and gyms, duplicate element IDs in `index.html`, plus a tracker for
  dialogue still marked `[DRAFT]`
- **Encounters** — per-route encounter tables with real percentages, and a
  species finder (pick a Pokémon, see every route/method/rate where it appears)
- **Balance** — trainer strength charted by distance from Pallet Town, gym
  leader levels, total trainer money in the game
- **Route Map** — the whole of Kanto as a graph; gated routes highlighted
- **Obtainability** — playtest harness results from the bundled `report.json`
  snapshot (refresh it by copying a newer `playtest/report.json` over it)

## Run on Streamlit Cloud
Deploy this repo, branch `main`, main file path `companion/app.py`.
It redeploys automatically on every push, so the dashboard always reflects
the current game data.

## Run locally
Python 3.10+, then:

```bash
pip install -r requirements.txt
streamlit run app.py
```

The app finds the game data automatically whether it lives inside the repo
(this layout) or beside a `repo/` folder in the dev workspace. To point it
somewhere else: `POKEMON_TEXT_DIR=/path/to/repo streamlit run app.py`.

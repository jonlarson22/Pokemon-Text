import { BattleEngine, BattleManager } from './battle.js';
import { CaptureSystem } from './captures.js';
import { GrowthEngine } from './growth.js';
import { UIManager } from './ui.js';
import { StorageManager } from './storage.js';
import { PokemonFactory } from './pokemon_factory.js';
import { FacilityManager } from './facilities.js';
import { InteractionManager } from './interactions.js';

class GameEngine {
  constructor() {
    this.gameState = {
      currentRoute: "pallet_town",
      hasStarter: false,
      rivalStarter: null,
      playerName: null,
      rivalName: null,
      flags: {},
      defeatedTrainers: {},
      party: [],
      money: 3000,
      coins: 0,
      inventory: { "potion": 1 },
      pc: { pokemon: [], items: {} },
      pokedex: { seen: {}, caught: {} },
      activeBattle: null,
      activeTrainer: null,
      lastHealedLocation: null,
      activeTrainerPartyIndex: 0,
      pendingEnemyMonData: null,
      visitedTowns: ["pallet_town"],
      removedNPCs: {},
      saveVersion: 1
    };

    this.partySwapIndex = null;
    this.captureSystem = new CaptureSystem(this);
    this.growth = new GrowthEngine(this);
    this.ui = new UIManager(this);
    this.storage = new StorageManager(this);
    this.factory = new PokemonFactory(this);
    this.facilities = new FacilityManager(this);
    this.interactions = new InteractionManager(this);
    this.battleManager = new BattleManager(this);
    
    this.db = {
      routes: {},
      pokemon: {},
      moves: {},
      trainers: {},
      typeChart: {},
      items: {},
      shops: {},
      gyms: {},
      npcs: {}
    };
  }

  async init() {
    const [routesRes, pokemonRes, movesRes, trainersRes, typesRes, itemsRes, shopsRes, gymsRes, npcsRes] = await Promise.all([
      fetch('./data/routes.json'),
      fetch('./data/pokemon.json'),
      fetch('./data/moves.json'),
      fetch('./data/trainers.json'),
      fetch('./data/type_chart.json'),
      fetch('./data/items.json'),
      fetch('./data/shops.json'),
      fetch('./data/gyms.json'),
      fetch('./data/npcs.json')
    ]);

    this.db.routes = await routesRes.json();
    this.db.pokemon = await pokemonRes.json();
    this.db.moves = await movesRes.json();
    this.db.trainers = await trainersRes.json();
    this.db.typeChart = await typesRes.json();
    this.db.items = await itemsRes.json();
    this.db.shops = await shopsRes.json();
    this.db.gyms = await gymsRes.json();
    this.db.npcs = await npcsRes.json();

    // Dev-only: warn about connections pointing at locations that
    // aren't in routes.json yet (future content, not errors).
    Object.entries(this.db.routes).forEach(([routeId, route]) => {
      (route.connections || []).forEach(connId => {
        if (!this.db.routes[connId]) {
          console.warn(`[dev] Route "${routeId}" connects to "${connId}", which is not in routes.json yet.`);
        }
      });
    });

    this.bindListeners();
    this.ui.updatePokedexTrackerUI();
    this.checkGameStart();
  }

  checkGameStart() {
    if (!this.gameState.hasStarter && this.gameState.party.length === 0) {
      // Fresh game: title screen -> Oak intro -> names -> stopped at Route 1 -> starter pick.
      this.ui.showTitleScreen();
    } else {
      this.ui.renderRouteScreen();
      this.ui.updatePartyUI();
      this.ui.updatePokedexTrackerUI();
      this.ui.setMenuState('route');
    }
  }

  // Hall of Fame: congratulations, a brief pause, then home to Pallet Town
  // where Oak congratulates the new Champion and helps them finish the Pokédex.
  hallOfFameSequence() {
    const ui = this.ui;
    ui.printToLog("...");
    ui.printToLog("CONGRATULATIONS, {player}! You have defeated the Pokémon League Champion!");
    ui.printToLog("Your name will be recorded in the Hall of Fame for all time!");
    ui.printToLog("...");
    setTimeout(() => {
      ui.printToLog("The next morning, you wake up back home in Pallet Town, rested and healed.");
      // A good night's rest restores the team (Pallet has no Center).
      this.gameState.party.forEach(p => {
        p.hp = p.maxHp; p.status = null;
        if (p.moves) p.moves.forEach(m => { if (m.maxPp !== undefined) m.pp = m.maxPp; });
      });
      this.gameState.currentRoute = "pallet_town";
      this.trackVisitedTown("pallet_town");
      ui.renderRouteScreen();
      ui.updatePartyUI();
      ui.printToLog("Prof. Oak: {player}! There you are! I heard the news — the new Champion of Kanto!");
      ui.printToLog("Prof. Oak: But a true Pokémon Master isn't made by badges alone. Your Pokédex still has gaps, and I want to help you fill them.");
      ui.printToLog("Prof. Oak: Take these — 5 Master Balls and 100 Rare Candies. Use them well, and go complete that Pokédex!");
      this.interactions.giveItem("master_ball", 5);
      this.interactions.giveItem("rare_candy", 100);
    }, 3000);
  }

  trackVisitedTown(routeId) {
    const routeData = this.db.routes[routeId];
    if (routeData && routeData.isTown && !this.gameState.visitedTowns.includes(routeId)) {
      this.gameState.visitedTowns.push(routeId);
    }
  }
  
  populateTravelMenu() {
    const container = document.getElementById('travel-destinations');
    container.innerHTML = '';

    const currentRouteData = this.db.routes[this.gameState.currentRoute];
    if (!currentRouteData || !currentRouteData.connections) return;

    currentRouteData.connections.forEach(destinationId => {
      const destData = this.db.routes[destinationId];
      if (!destData) return;
      if (destData.req_flag && !this.meetsReqFlag(destData.req_flag)) return; 

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Go to ${destData.name}`;
      btn.onclick = () => this.ui.travelTo(destinationId);
      container.appendChild(btn);
    });
  }

  getWeightedRandom(items) {
    if (!items || items.length === 0) return { type: "nothing", weight: 1 };
    const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0), 0);
    if (totalWeight <= 0) return { type: "nothing", weight: 1 };
    let random = Math.random() * totalWeight;
    for (const item of items) {
      if (random < (item.weight || 0)) return item;
      random -= (item.weight || 0);
    }
    return { type: "nothing", weight: 1 };
  }

  openEncounterMenu() {
    const route = this.db.routes[this.gameState.currentRoute];
    if (!route.encounters || Object.keys(route.encounters).length === 0) {
      this.ui.printToLog("There are no wild Pokémon here.");
      return;
    }

    this.ui.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '<p style="text-align:center;">Where do you want to search?</p>';
    controls.innerHTML = '';

    const buttons = [];

    // Encounter entries can require a flag (e.g. Route 12's grass needs Cut).
    const eligible = (list) => (list || []).filter(e => this.meetsReqFlag(e.req_flag));

    const grass = eligible(route.encounters.grass);
    if (grass.length > 0) {
      buttons.push({
        text: "Search Tall Grass",
        action: () => this.executeEncounter(grass)
      });
    }

    const water = eligible(route.encounters.water);
    if (water.length > 0) {
      buttons.push({
        text: "Fish / Surf",
        action: () => {
          if (this.hasFlag('obtained_fishing_rod') || this.hasFlag('soul_badge') || this.hasFlag('obtained_hm03')) {
            this.executeEncounter(water);
          } else {
            this.ui.printToLog("You need a Fishing Rod or Surf to look here!");
            this.ui.setMenuState('route');
          }
        }
      });
    }

    buttons.push({ text: "Cancel", action: () => this.ui.setMenuState('route') });
    this.ui.buildMenuControls(controls, buttons);
  }

  executeEncounter(encounterList) {
    const result = this.triggerEncounter(encounterList);
    if (typeof result === 'string') this.ui.printToLog(result);
    else this.startWildBattle(result);
  }

  // Wild battles in the Safari Zone use the Safari catching minigame
  // (Safari Balls / bait / rocks, no fighting) instead of normal battles.
  startWildBattle(result) {
    const route = this.db.routes[this.gameState.currentRoute];
    if (route && route.safari) this.battleManager.startSafariBattle(result);
    else this.battleManager.startBattle(result);
  }

  async startTrainerEncounter(trainerId) {
    // Guard against double-clicks while the pre-battle taunt is revealing.
    if (this._inEncounter) return;
    this._inEncounter = true;
    try {
      const trainer = this.db.trainers[trainerId];
      if (!trainer) {
        this.ui.printToLog("Error: Trainer data not found!");
        return;
      }

      this.ui.printToLog(`${trainer.name} wants to battle!`);
      // Story taunt reveals line by line; the battle starts after.
      // Headless/test UIs (no printDialogue) stay fully synchronous.
      const r = this.ui.printDialogue
        ? this.ui.printDialogue(`"${trainer.dialogueBefore}"`)
        : this.ui.printToLog(`"${trainer.dialogueBefore}"`);
      if (r && r.then) await r;

      // Generate the full party of Pokémon instances with custom moves/levels
      const enemyParty = this.factory.generateTrainerParty(trainer);

      this.gameState.activeTrainerId = trainerId;
      this.ui.setMenuState('battle');
      this.battleManager.startTrainerBattle(enemyParty, trainer);
    } finally {
      this._inEncounter = false;
    }
  }
  
  triggerEncounter(encounterList) {
    if (!encounterList || !encounterList.length) return "No wild Pokémon nearby.";
    // Repel: only mons at/above the lead mon's level can appear. Ticks down
    // once per encounter roll; expires with a message.
    let list = encounterList;
    let levelFloor = 0;
    const repel = this.gameState.repel;
    if (repel && repel.encountersLeft > 0) {
      const leadLevel = (this.gameState.party[0] || {}).level || 1;
      levelFloor = leadLevel;
      list = encounterList.filter(e => (e.max_level || 0) >= leadLevel);
      repel.encountersLeft--;
      if (repel.encountersLeft <= 0) {
        this.gameState.repel = null;
        this.ui.printToLog("The Repel's effect wore off!");
      }
      if (!list.length) return "The Repel kept the weaker Pokémon away.";
    }
    const selected = this.getWeightedRandom(list);
    const lo = Math.max(selected.min_level, levelFloor);
    const level = Math.floor(Math.random() * (selected.max_level - lo + 1)) + lo;
    return { species: selected.species, level: level };
  }

  triggerExplore() {
    const route = this.db.routes[this.gameState.currentRoute];
    // Entries can require a flag (e.g. Snorlax only appears once woken).
    // secret_switch entries vanish once their flag is set (one-time discovery).
    // If nothing is eligible, exploring finds nothing.
    const table = (route.explore_table || []).filter(e =>
      this.meetsReqFlag(e.req_flag) &&
      (!e.req_flag_count || this.countMatchingFlags(e.req_flag_count) >= (e.req_flag_count.qty || 0)) &&
      !(e.type === "secret_switch" && e.flag && this.hasFlag(e.flag))
    );
    const outcome = this.getWeightedRandom(table.length ? table : [{ type: "nothing", weight: 1 }]);

    switch (outcome.type) {
      case "nothing":
        return "You searched the area but found nothing of interest.";
      
      case "encounter":
        const zone = (route.encounters.grass || []).filter(e => this.meetsReqFlag(e.req_flag));
        return this.triggerEncounter(zone);
      
      case "item":
        // 1. Create a unique flag per route+item to prevent infinite looting.
        //    Different items on the same route can each be found once.
        // 2. Force the item ID to lowercase to ensure it matches db.items exactly
        const itemId = outcome.item.toLowerCase();
        const itemFlag = `found_item_${this.gameState.currentRoute}_${itemId}`;
        if (this.hasFlag(itemFlag)) {
          // If they already found this item, default to "nothing" instead
          return "You searched the area but found nothing of interest.";
        }
        
        // Mark the item as found
        this.setFlag(itemFlag, true);
        // Optional extra flag (e.g. quest items like the Old Amber)
        if (outcome.flag) this.setFlag(outcome.flag, true);

        this.gameState.inventory[itemId] = (this.gameState.inventory[itemId] || 0) + 1;
        
        // Try to get the formatted name from the DB for the log message, fallback to the raw string
        const itemName = this.db.items[itemId] ? this.db.items[itemId].name : outcome.item;
        return `You found a ${itemName}!`;
      case "static_encounter": {
        // Scripted wild battle (e.g. Mewtwo). Re-encounterable until caught,
        // or until win_flag is set (for uncatchable scripted fights like the
        // ghost Marowak).
        if (this.gameState.pokedex.caught[outcome.species.toLowerCase()]) {
          return "You searched the area but found nothing of interest.";
        }
        if (outcome.win_flag && this.hasFlag(outcome.win_flag)) {
          return "You searched the area but found nothing of interest.";
        }
        return { species: outcome.species, level: outcome.level, intro: outcome.intro,
                 uncatchable: !!outcome.uncatchable, win_flag: outcome.win_flag || null };
      }
      case "coins": {
        // Game Corner floor coins: one-time pickup per id, needs the coin case flag.
        const coinFlag = `found_coins_${this.gameState.currentRoute}_${outcome.id || outcome.amount}`;
        if (this.hasFlag(coinFlag)) {
          return "You searched the area but found nothing of interest.";
        }
        this.setFlag(coinFlag, true);
        const amount = outcome.amount || 0;
        this.gameState.coins = (this.gameState.coins || 0) + amount;
        this.ui.updateMoneyUI();
        return `You found ${amount} coins on the floor! (Total: ${this.gameState.coins})`;
      }
      case "secret_switch": {
        // One-time discovery with a yes/no choice (e.g. the Rocket Hideout switch).
        return { choice: {
          prompt: outcome.prompt,
          yes_label: outcome.yes_label || "Yes",
          no_label: outcome.no_label || "No",
          flag: outcome.flag,
          success: outcome.success,
          decline: outcome.decline,
        } };
      }
      case "prompt_encounter": {
        // Explore discovery that asks first, then starts a scripted battle
        // on Yes (e.g. the truck on Vermilion Dock). Re-encounterable until
        // caught, or until win_flag is set.
        if (this.gameState.pokedex.caught[(outcome.species || '').toLowerCase()]) {
          return "You searched the area but found nothing of interest.";
        }
        if (outcome.win_flag && this.hasFlag(outcome.win_flag)) {
          return "You searched the area but found nothing of interest.";
        }
        const battleSpec = { species: outcome.species, level: outcome.level,
          uncatchable: !!outcome.uncatchable, win_flag: outcome.win_flag || null };
        return { choice: {
          prompt: outcome.prompt,
          yes_label: outcome.yes_label || "Yes",
          no_label: outcome.no_label || "No",
          decline: outcome.decline || "You leave it alone.",
          onYes: () => {
            this.ui.printToLog(outcome.intro || "You were ambushed!");
            this.startWildBattle(battleSpec);
          },
        } };
      }
      }
    }

  setFlag(flagName, value = true) {
    this.gameState.flags[flagName] = value;
    if (this.ui && this.ui.updateBadgeUI) this.ui.updateBadgeUI();
  }

  hasFlag(flagName) {
    return !!this.gameState.flags[flagName];
  }

  // req_flag may be a single flag or a list of flags (all required).
  // Used for canon badge-gated field HM use (e.g. Cut needs Cascade Badge).
  meetsReqFlag(req) {
    if (!req) return true;
    if (Array.isArray(req)) return req.every(f => this.hasFlag(f));
    return this.hasFlag(req);
  }

  // Count set flags matching a spec like {category:'gym_badges', qty:8}
  // (mirrors the NPC flag_count requirement semantics).
  countMatchingFlags(spec) {
    const all = this.gameState.flags || {};
    const set = Object.keys(all).filter(f => !!all[f]);
    let matching = set;
    if (spec.category === 'gym_badges') matching = set.filter(f => f.endsWith('_badge'));
    else if (spec.prefix) matching = set.filter(f => f.startsWith(spec.prefix));
    return matching.length;
  }
  
  bindListeners() {
    document.getElementById('btn-starter-bulbasaur')?.addEventListener('click', () => this.factory.pickStarter('bulbasaur'));
    document.getElementById('btn-starter-charmander')?.addEventListener('click', () => this.factory.pickStarter('charmander'));
    document.getElementById('btn-starter-squirtle')?.addEventListener('click', () => this.factory.pickStarter('squirtle'));
    
    document.getElementById('btn-encounter')?.addEventListener('click', () => this.openEncounterMenu());

    document.getElementById('btn-explore')?.addEventListener('click', () => {
      const result = this.triggerExplore();
      if (typeof result === 'string') this.ui.printToLog(result);
      else if (result && result.choice) this.ui.openChoiceMenu(result.choice);
      else if (result && result.species) {
        this.ui.printToLog(result.intro || `You were ambushed!`);
        this.startWildBattle(result);
      }
    });

    document.getElementById('btn-pokemon')?.addEventListener('click', () => this.ui.openPokemonMenu());
    document.getElementById('btn-party')?.addEventListener('click', () => this.ui.openPokemonMenu());
    document.getElementById('btn-pokedex')?.addEventListener('click', () => this.ui.openPokedex());
    
document.getElementById('btn-fight')?.addEventListener('click', () => {
      const route = this.db.routes[this.gameState.currentRoute];
      if (!route.trainers || route.trainers.length === 0) {
        this.ui.printToLog("There are no trainers looking for a battle here.");
        return;
      }

      this.ui.setMenuState('dynamic');
      const content = document.getElementById('dynamic-content');
      const controls = document.getElementById('dynamic-controls');
      content.innerHTML = '<p style="text-align:center;">Who do you want to challenge?</p>';
      controls.innerHTML = '';

      const buttons = [];

      route.trainers.forEach(trainerId => {
        const trainerTemplate = this.db.trainers[trainerId];
        if (!trainerTemplate) return;

        const isDefeated = this.gameState.defeatedTrainers[trainerId];
        const statusText = isDefeated ? "(Defeated)" : "";

        buttons.push({
          text: this.ui.substituteNames(`Battle ${trainerTemplate.name} ${statusText}`),
          action: () => {
            if (isDefeated) {
              this.ui.printToLog(`${trainerTemplate.name} has already been defeated!`);
              return;
            }
            this.startTrainerEncounter(trainerId); 
          }
        });
      });

      buttons.push({ text: "Cancel", action: () => this.ui.setMenuState('route') });
      this.ui.buildMenuControls(controls, buttons);
    });

    document.getElementById('btn-travel')?.addEventListener('click', () => this.ui.setMenuState('travel'));
    document.getElementById('btn-menu')?.addEventListener('click', () => this.ui.setMenuState('system'));
    document.getElementById('btn-back-menu')?.addEventListener('click', () => this.ui.setMenuState('route'));
    document.getElementById('btn-back-travel')?.addEventListener('click', () => this.ui.setMenuState('route'));
    document.getElementById('btn-save')?.addEventListener('click', () => this.handleSaveLoad());
    document.getElementById('btn-bag')?.addEventListener('click', () => this.openBag());

    document.getElementById('btn-cancel-target')?.addEventListener('click', () => {
          if (this.gameState.activeBattle) {
            this.ui.setMenuState('battle');
          } else {
            this.openBag();
          }
        });
    
    document.getElementById('btn-fight')?.addEventListener('click', () => {
      this.ui.showBattleMoves();
    });

    document.getElementById('btn-battle-pokemon')?.addEventListener('click', () => {
      this.ui.openBattleSwitchMenu();
    });

    document.getElementById('btn-moves-back')?.addEventListener('click', () => {
      this.ui.showBattleMain();
    });

    document.getElementById('btn-run')?.addEventListener('click', () => {
      if (this.gameState.catchAnimating) return; // ball mid-shake: input locked
      if (this.gameState.activeTrainer) {
        this.ui.printToLog("You can't run from a trainer battle!");
        return;
      }
      this.ui.printToLog("Got away safely!");
      // Full cleanup so no stale trainer/battle state leaks into the next fight.
      this.gameState.activeBattle = null;
      this.gameState.activeTrainer = null;
      this.gameState.activeTrainerId = null;
      this.gameState.activeWinFlag = null;
      this.gameState.activeWildWinFlag = null;
      this.ui.setMenuState('route');
    });

    document.getElementById('btn-load-game')?.addEventListener('click', () => this.storage.loadLocal());
    document.getElementById('btn-import-save')?.addEventListener('click', () => {
      document.getElementById('input-import-file').click();
    });
    document.getElementById('input-import-file')?.addEventListener('change', (e) => this.storage.handleImport(e));
  }
    
  openBag() {
    if (this.gameState.catchAnimating) return; // ball mid-shake: input locked
    const inventoryEntries = Object.entries(this.gameState.inventory);
    
    if (inventoryEntries.length === 0 || inventoryEntries.every(([_, count]) => count <= 0)) {
      this.ui.printToLog("Your bag is empty!");
      return;
    }

    this.ui.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    this.ui.printToLog("--- Bag Contents ---");

    // TMs & HMs live behind one submenu button (sorted by number inside),
    // so 90+ machines don't flood the bag.
    const machineEntries = [];
    inventoryEntries.forEach(([itemKey, count]) => {
      if (count > 0) {
        const itemData = this.db.items[itemKey];
        if (itemData && (itemData.category === "tm" || itemData.category === "hm")) {
          machineEntries.push([itemKey, count]);
        }
      }
    });

    if (machineEntries.length > 0) {
      const total = machineEntries.reduce((n, [, c]) => n + c, 0);
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `TMs & HMs (x${total})`;
      btn.onclick = () => this.ui.openMachineMenu(machineEntries);
      content.appendChild(btn);
    }

    inventoryEntries.forEach(([itemKey, count]) => {
      if (count > 0) {
        const itemData = this.db.items[itemKey];
        if (!itemData) return;
        if (itemData.category === "tm" || itemData.category === "hm") return;

        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = `Use ${itemData.name} (x${count})`;
        btn.onclick = () => this.ui.handleItemClick(itemKey);
        content.appendChild(btn);
      }
    });

    this.ui.buildMenuControls(controls, [
      { text: "Close Bag", action: () => {
          if (this.gameState.activeBattle) this.ui.setMenuState('battle');
          else this.ui.setMenuState('system');
      }}
    ]);
  }

  handleSaveLoad() {
    this.ui.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '<p style="text-align:center;"><strong>Save / Load Manager</strong></p>';
    controls.innerHTML = '';

    this.ui.buildMenuControls(controls, [
      { text: "Save (Local)", action: () => this.storage.saveLocal() },
      { text: "Load (Local)", action: () => this.storage.loadLocal() },
      { text: "Export File", action: () => this.storage.exportSave() },
      { text: "Import File", action: () => document.getElementById('input-import-file').click() },
      { text: "Close", action: () => this.ui.setMenuState('system') }
    ]);
  }
}

const game = new GameEngine();
game.init();

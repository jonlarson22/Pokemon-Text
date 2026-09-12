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
      flags: {},
      defeatedTrainers: {},
      party: [],
      money: 3000,
      inventory: { "potion": 1 },
      pc: { pokemon: [], items: {} },
      pokedex: { seen: {}, caught: {} },
      activeBattle: null,
      activeTrainer: null,
      lastHealedLocation: null,
      activeTrainerPartyIndex: 0,
      pendingEnemyMonData: null,
      visitedTowns: ["pallet_town"],
      currentRoute: "pallet_town"
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
    
    this.bindListeners();
    this.ui.updatePokedexTrackerUI();
    this.checkGameStart();
  }

  checkGameStart() {
    if (!this.gameState.hasStarter && this.gameState.party.length === 0) {
      this.ui.printToLog("Welcome to the world of Pokémon!");
      this.ui.printToLog("You're in Pallet Town, in the Kanto region, where shades of your journey await!");
      this.ui.printToLog("Choose a starter Pokémon to be your first companion. Good luck!");
      this.ui.setMenuState('starter');
    } else {
      this.ui.renderRouteScreen();
      this.ui.updatePartyUI();
      this.ui.updatePokedexTrackerUI();
      this.ui.setMenuState('route');
    }
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
      if (destData.req_flag && !this.gameState.flags[destData.req_flag]) return; 

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Go to ${destData.name}`;
      btn.onclick = () => this.ui.travelTo(destinationId);
      container.appendChild(btn);
    });
  }

  getWeightedRandom(items) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    for (const item of items) {
      if (random < item.weight) return item;
      random -= item.weight;
    }
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

    if (route.encounters.grass && route.encounters.grass.length > 0) {
      buttons.push({
        text: "Search Tall Grass",
        action: () => this.executeEncounter(route.encounters.grass)
      });
    }

    if (route.encounters.water && route.encounters.water.length > 0) {
      buttons.push({
        text: "Fish / Surf",
        action: () => {
          if (this.gameState.inventory['fishing_rod'] || this.hasFlag('badge_5')) {
            this.executeEncounter(route.encounters.water);
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
    else this.battleManager.startBattle(result);
  }

  triggerEncounter(encounterList) {
    if (!encounterList || !encounterList.length) return "No wild Pokémon nearby.";
    const selected = this.getWeightedRandom(encounterList);
    const level = Math.floor(Math.random() * (selected.max_level - selected.min_level + 1)) + selected.min_level;
    return { species: selected.species, level: level };
  }

  triggerExplore() {
    const route = this.db.routes[this.gameState.currentRoute];
    const outcome = this.getWeightedRandom(route.explore_table);

    switch (outcome.type) {
      case "nothing":
        return "You searched the area but found nothing of interest.";
      
      case "encounter":
        const zone = route.encounters.grass || [];
        return this.triggerEncounter(zone);
      
      case "item":
        // 1. Create a unique flag for this route to prevent infinite looting
        const itemFlag = `found_item_${this.gameState.currentRoute}`;
        if (this.hasFlag(itemFlag)) {
          // If they already found this route's item, default to "nothing" instead
          return "You searched the area but found nothing of interest.";
        }
        
        // Mark the item as found
        this.setFlag(itemFlag, true);

        // 2. Force the item ID to lowercase to ensure it matches db.items exactly
        const itemId = outcome.item.toLowerCase();
        this.gameState.inventory[itemId] = (this.gameState.inventory[itemId] || 0) + 1;
        
        // Try to get the formatted name from the DB for the log message, fallback to the raw string
        const itemName = this.db.items[itemId] ? this.db.items[itemId].name : outcome.item;
        return `You found a ${itemName}!`;
      }
    }

  setFlag(flagName, value = true) {
    this.gameState.flags[flagName] = value;
  }

  hasFlag(flagName) {
    return !!this.gameState.flags[flagName];
  }
  
  bindListeners() {
    document.getElementById('btn-starter-bulbasaur')?.addEventListener('click', () => this.factory.pickStarter('bulbasaur'));
    document.getElementById('btn-starter-charmander')?.addEventListener('click', () => this.factory.pickStarter('charmander'));
    document.getElementById('btn-starter-squirtle')?.addEventListener('click', () => this.factory.pickStarter('squirtle'));
    
    document.getElementById('btn-encounter')?.addEventListener('click', () => this.openEncounterMenu());

    document.getElementById('btn-explore')?.addEventListener('click', () => {
      const result = this.triggerExplore();
      if (typeof result === 'string') this.ui.printToLog(result);
      else if (result && result.species) {
        this.ui.printToLog(`You were ambushed!`);
        this.battleManager.startBattle(result);
      }
    });

    document.getElementById('btn-pokemon')?.addEventListener('click', () => this.ui.openPokemonMenu());
    document.getElementById('btn-party')?.addEventListener('click', () => this.ui.openPokemonMenu());
    document.getElementById('btn-pokedex')?.addEventListener('click', () => this.ui.openPokedex());
    
    document.getElementById('btn-fight')?.addEventListener('click', () => {
      const route = this.db.routes[this.gameState.currentRoute];
      if (!route.trainers || route.trainers.length === 0) {
        this.ui.printToLog("No active trainer battle nearby right now.");
        return;
      }

      const undefeatedTrainerId = route.trainers.find(id => !this.gameState.defeatedTrainers[id]);
      if (!undefeatedTrainerId) {
        this.ui.printToLog("You have already defeated all trainers on this route!");
        return;
      }

      const trainer = this.factory.getDynamicTrainer(undefeatedTrainerId);
      if (!trainer) {
        this.ui.printToLog("Error: Trainer data not found!");
        return;
      }

      this.ui.printToLog(`${trainer.name} wants to battle!`);
      this.ui.printToLog(`"${trainer.dialogueBefore}"`);

      const enemyMonData = trainer.party[0];
      const enemyMon = this.factory.generatePokemonInstance(enemyMonData.species, enemyMonData.level);

      if (enemyMonData.moves) {
        enemyMon.moves = enemyMonData.moves.map(moveId => this.db.moves[moveId]).filter(m => m);
      }

      this.gameState.defeatedTrainers[undefeatedTrainerId] = true; 
      this.gameState.activeTrainerPartyIndex = 0; 
      this.battleManager.startTrainerBattle(enemyMon, trainer);
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
    
    document.getElementById('btn-run')?.addEventListener('click', () => {
      if (this.gameState.activeTrainer) {
        this.ui.printToLog("You can't run from a trainer battle!");
        return;
      }
      this.ui.printToLog("Got away safely!");
      this.gameState.activeBattle = null;
      this.ui.setMenuState('route');
    });

    document.getElementById('btn-load-game')?.addEventListener('click', () => this.storage.loadLocal());
    document.getElementById('btn-import-save')?.addEventListener('click', () => {
      document.getElementById('input-import-file').click();
    });
    document.getElementById('input-import-file')?.addEventListener('change', (e) => this.storage.handleImport(e));
  }
    
  openBag() {
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

    inventoryEntries.forEach(([itemKey, count]) => {
      if (count > 0) {
        const itemData = this.db.items[itemKey];
        if (!itemData) return;

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

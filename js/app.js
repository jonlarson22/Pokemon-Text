// js/app.js - Complete Route, Encounter, and Battle Manager
import { BattleEngine } from './battle.js';

class GameEngine {
  constructor() {
    this.gameState = {
      currentRoute: "route1",
      flags: {},
      defeatedTrainers: {},
      party: [],
      inventory: { "Potion": 1 },
      pokedex: { seen: {}, caught: {} },
      activeBattle: null
    };
    
    this.db = {
      routes: {},
      pokemon: {},
      moves: {},
      trainers: {}
    };
  }

  async init() {
    // 1. Fetch all JSON files concurrently
    const [routesRes, pokemonRes, movesRes, trainersRes] = await Promise.all([
      fetch('./data/routes.json'),
      fetch('./data/pokemon.json'),
      fetch('./data/moves.json'),
      fetch('./data/trainers.json')
    ]);

    this.db.routes = await routesRes.json();
    this.db.pokemon = await pokemonRes.json();
    this.db.moves = await movesRes.json();
    this.db.trainers = await trainersRes.json();

    // 2. Generate the Player's Starter (Level 5 Charmander)
    this.gameState.party.push(this.generatePokemonInstance("charmander", 5));

    // 3. Initial UI Render
    this.renderRouteScreen();
    this.updatePartyUI();
    this.printToLog("Welcome to the Kanto region!");

    // 4. Attach DOM Event Listeners
    this.bindListeners();
  }

  // --- STAT GENERATOR (Gen 4 Logic) ---
  generatePokemonInstance(speciesId, level) {
    const safeId = speciesId.toLowerCase(); 
    const baseData = this.db.pokemon[safeId];
    
    if (!baseData) {
      console.error(`Missing data for species: ${speciesId}`);
      return null;
    }

    const hp = Math.floor((2 * baseData.baseStats.hp * level) / 100) + level + 10;
    
    return {
      species: baseData.name,
      types: baseData.types,
      level: level,
      hp: hp,
      maxHp: hp,
      speed: Math.floor((2 * baseData.baseStats.speed * level) / 100) + 5,
      stats: {
        attack: Math.floor((2 * baseData.baseStats.attack * level) / 100) + 5,
        defense: Math.floor((2 * baseData.baseStats.defense * level) / 100) + 5,
        spAtk: Math.floor((2 * baseData.baseStats.spAtk * level) / 100) + 5,
        spDef: Math.floor((2 * baseData.baseStats.spDef * level) / 100) + 5,
      },
      moves: baseData.moves.map(moveId => this.db.moves[moveId]).filter(Boolean)
    };
  }

  // --- DOM & UI UTILITIES ---
  printToLog(message) {
    const display = document.getElementById('display-area');
    if (!display) return;
    
    const p = document.createElement('p');
    p.className = 'log-entry';
    p.textContent = message;
    display.appendChild(p);
    display.scrollTop = display.scrollHeight; 
  }

  updatePartyUI() {
    const lead = this.gameState.party[0];
    const partyDisplay = document.getElementById('party-list');
    if (partyDisplay && lead) {
      partyDisplay.textContent = `${lead.species} (Lv. ${lead.level}) - HP: ${lead.hp}/${lead.maxHp}`;
    }
  }

    renderRouteScreen() {
    const route = this.db.routes[this.gameState.currentRoute];
    const locationEl = document.getElementById('location-name');
    if (locationEl && route) locationEl.textContent = route.name;

    // Toggle City-specific buttons (Center / Shop) if defined in route data
    const centerBtn = document.getElementById('btn-pokemon-center');
    const shopBtn = document.getElementById('btn-shop');

    if (centerBtn) {
      centerBtn.style.display = route.hasCenter ? "block" : "none";
      centerBtn.onclick = () => {
        this.gameState.party.forEach(p => p.hp = p.maxHp);
        this.updatePartyUI();
        this.printToLog(`Welcome to the Pokémon Center! Your party was fully healed.`);
      };
    }

    if (shopBtn) {
      shopBtn.style.display = route.hasShop ? "block" : "none";
      shopBtn.onclick = () => {
        this.printToLog("The Poké Mart stock is currently being unpacked!");
      };
    }
  }

  // --- UI MENU CONTROLS ---
  setMenuState(menuName) {
    document.getElementById('route-actions').style.display = 'none';
    document.getElementById('system-menu').style.display = 'none';
    document.getElementById('travel-menu').style.display = 'none';
    document.getElementById('battle-actions').style.display = 'none';

    if (menuName === 'route') {
      document.getElementById('route-actions').style.display = 'grid';
    } else if (menuName === 'system') {
      document.getElementById('system-menu').style.display = 'grid';
    } else if (menuName === 'travel') {
      document.getElementById('travel-menu').style.display = 'flex';
      this.populateTravelMenu();
    } else if (menuName === 'battle') {
      document.getElementById('battle-actions').style.display = 'grid';
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

      if (destData.req_flag && !this.gameState.flags[destData.req_flag]) {
         return; 
      }

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Go to ${destData.name}`;
      btn.onclick = () => {
        this.gameState.currentRoute = destinationId;
        this.renderRouteScreen();
        this.printToLog(`You traveled to ${destData.name}.`);
        this.setMenuState('route');
      };
      container.appendChild(btn);
    });
  }

  // --- ROUTE & ENCOUNTER LOGIC ---
  getWeightedRandom(items) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of items) {
      if (random < item.weight) return item;
      random -= item.weight;
    }
  }

  triggerEncounter() {
    const route = this.db.routes[this.gameState.currentRoute];
    if (!route || !route.encounters.length) return "No wild Pokémon nearby.";

    const selected = this.getWeightedRandom(route.encounters);
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
        return this.triggerEncounter();
      case "item":
        this.gameState.inventory[outcome.item] = (this.gameState.inventory[outcome.item] || 0) + 1;
        return `You found a ${outcome.item}!`;
    }
  }

  // --- BATTLE LOGIC ---
  startBattle(wildPokemonInfo) {
    const speciesKey = wildPokemonInfo.species.toLowerCase();
    this.gameState.pokedex.seen[speciesKey] = true;

    const enemyMon = this.generatePokemonInstance(wildPokemonInfo.species, wildPokemonInfo.level);
    
    if (!enemyMon) {
      this.printToLog("Error generating wild Pokémon stats!");
      return;
    }

    this.printToLog(`A wild ${enemyMon.species} (Lv. ${enemyMon.level}) appeared!`);
    
    this.gameState.activeBattle = new BattleEngine(this.gameState.party[0], enemyMon, (msg) => {
      this.printToLog(msg);
      this.updatePartyUI();
      },
      this.db.typeChart
    );

    const leadMoves = this.gameState.party[0].moves;
    for (let i = 0; i < 4; i++) {
      const btn = document.getElementById(`btn-move-${i}`);
      if (btn && leadMoves[i]) {
        btn.textContent = leadMoves[i].name;
        btn.onclick = () => this.handleTurn(leadMoves[i]);
        btn.style.display = "block";
      } else if (btn) {
        btn.style.display = "none";
      }
    }

    // Bind battle bag button
    const battleBagBtn = document.getElementById('btn-battle-bag');
    if (battleBagBtn) {
      battleBagBtn.onclick = () => this.openBag();
    }

    this.setMenuState('battle');
  }

startTrainerBattle(enemyMon, trainer) {
    const speciesKey = enemyMon.species.toLowerCase();
    this.gameState.pokedex.seen[speciesKey] = true;

    if (!enemyMon) {
      this.printToLog("Error generating trainer's Pokémon!");
      return;
    }

    this.printToLog(`${trainer.name} sent out ${enemyMon.species} (Lv. ${enemyMon.level})!`);
    
    this.gameState.activeBattle = new BattleEngine(
      this.gameState.party[0], 
      enemyMon, 
      (msg) => {
        this.printToLog(msg);
        this.updatePartyUI();
      },
      this.db.typeChart
    );

    const leadMoves = this.gameState.party[0].moves;
    for (let i = 0; i < 4; i++) {
      const btn = document.getElementById(`btn-move-${i}`);
      if (btn && leadMoves[i]) {
        btn.textContent = leadMoves[i].name;
        btn.onclick = () => this.handleTurn(leadMoves[i]);
        btn.style.display = "block";
      } else if (btn) {
        btn.style.display = "none";
      }
    }

    const battleBagBtn = document.getElementById('btn-battle-bag');
    if (battleBagBtn) {
      battleBagBtn.onclick = () => this.openBag();
    }

    this.setMenuState('battle');
  }

  handleTurn(playerMove) {
    this.gameState.activeBattle.executeTurn(playerMove);
    
    if (this.gameState.activeBattle.isOver) {
      setTimeout(() => {
        this.printToLog("Returning to the route...");
        this.setMenuState('route');
      }, 2000);
    }
  }

  // --- EVENT LISTENERS ---
  bindListeners() {
    document.getElementById('btn-encounter')?.addEventListener('click', () => {
      const result = this.triggerEncounter();
      if (typeof result === 'string') this.printToLog(result);
      else this.startBattle(result);
    });

    document.getElementById('btn-explore')?.addEventListener('click', () => {
      const result = this.triggerExplore();
      if (typeof result === 'string') this.printToLog(result);
      else if (result && result.species) {
        this.printToLog(`You were ambushed!`);
        this.startBattle(result);
      }
    });

    document.getElementById('btn-fight')?.addEventListener('click', () => {
      const route = this.db.routes[this.gameState.currentRoute];
      
      if (!route.trainers || route.trainers.length === 0) {
        this.printToLog("No active trainer battle nearby right now.");
        return;
      }

      // Find the first trainer ID in the array that hasn't been defeated yet
      const undefeatedTrainerId = route.trainers.find(id => !this.gameState.defeatedTrainers[id]);

      if (!undefeatedTrainerId) {
        this.printToLog("You have already defeated all trainers on this route!");
        return;
      }

      // Look up the trainer data from our newly loaded database
      const trainer = this.db.trainers[undefeatedTrainerId];
      if (!trainer) {
        this.printToLog("Error: Trainer data not found!");
        return;
      }

      this.printToLog(`${trainer.name} wants to battle!`);
      this.printToLog(`"${trainer.dialogueBefore}"`);

      // Generate the trainer's first Pokémon
      const enemyMonData = trainer.party[0];
      const enemyMon = this.generatePokemonInstance(enemyMonData.species, enemyMonData.level);

      // Mark as defeated so you don't fight them endlessly
      this.gameState.defeatedTrainers[undefeatedTrainerId] = true; 

      this.startTrainerBattle(enemyMon, trainer);
    });

    document.getElementById('btn-travel')?.addEventListener('click', () => {
      this.setMenuState('travel');
    });

    document.getElementById('btn-menu')?.addEventListener('click', () => {
      this.setMenuState('system');
    });

    document.getElementById('btn-back-menu')?.addEventListener('click', () => {
      this.setMenuState('route');
    });

    document.getElementById('btn-back-travel')?.addEventListener('click', () => {
      this.setMenuState('route');
    });

    document.getElementById('btn-save')?.addEventListener('click', () => {
      this.handleSaveLoad();
    });

    document.getElementById('btn-bag')?.addEventListener('click', () => {
      this.openBag();
    });

    document.getElementById('btn-pokedex')?.addEventListener('click', () => {
      this.printToLog("Pokédex feature coming soon!");
    });

    document.getElementById('btn-run')?.addEventListener('click', () => {
      this.printToLog("Got away safely!");
      this.setMenuState('route');
    });
  }

  // --- BAG / ITEM LOGIC ---
  openBag() {
    const inventoryEntries = Object.entries(this.gameState.inventory);
    
    if (inventoryEntries.length === 0 || inventoryEntries.every(([_, count]) => count <= 0)) {
      this.printToLog("Your bag is empty!");
      return;
    }

    this.printToLog("--- Bag Contents ---");
    inventoryEntries.forEach(([item, count]) => {
      if (count > 0) {
        this.printToLog(`${item}: x${count}`);
      }
    });

    // For a quick interactive choice if you have Potions:
    const potions = this.gameState.inventory["Potion"] || 0;
    const lead = this.gameState.party[0];

    if (potions > 0 && lead.hp < lead.maxHp) {
      const usePotion = window.confirm(`You have ${potions} Potion(s). Would you like to use one on ${lead.species}?`);
      if (usePotion) {
        this.gameState.inventory["Potion"]--;
        const healAmount = 20;
        lead.hp = Math.min(lead.maxHp, lead.hp + healAmount);
        this.printToLog(`Used a Potion! Restored ${lead.species}'s health.`);
        this.updatePartyUI();

        if (this.gameState.activeBattle && !this.gameState.activeBattle.isOver) {
          this.printToLog("The wild Pokémon attacks while your guard is down!");
        }
      }
    }
  }

  // --- SAVE SYSTEM ---
  handleSaveLoad() {
    const choice = window.confirm("Click OK to Export your save string.\nClick Cancel to Import a save string.");
    if (choice) {
      this.exportSave();
    } else {
      this.importSave();
    }
  }

  exportSave() {
    try {
      const saveData = JSON.stringify(this.gameState);
      const encodedSave = btoa(saveData);
      
      this.printToLog("SAVE SUCCESSFUL. Copy this string and save it somewhere safe:");
      this.printToLog(encodedSave);
      
      navigator.clipboard.writeText(encodedSave).then(() => {
        this.printToLog("(Save string copied to your clipboard!)");
      }).catch(err => {
        console.log("Clipboard API failed, user must copy manually.", err);
      });
    } catch (error) {
      this.printToLog("Error exporting save data.");
    }
  }

  importSave() {
    const saveString = window.prompt("Paste your save string here:");
    if (!saveString) return;

    try {
      const decodedSave = atob(saveString);
      const parsedState = JSON.parse(decodedSave);

      if (parsedState && parsedState.party && parsedState.currentRoute) {
        this.gameState = parsedState;
        this.renderRouteScreen();
        this.updatePartyUI();
        this.setMenuState('route');
        this.printToLog("Game loaded successfully!");
      } else {
        this.printToLog("Error: Invalid save string format.");
      }
    } catch (error) {
      this.printToLog("Error: Failed to load save. The string might be corrupted.");
    }
  }
}

// Instantiate and initialize
const game = new GameEngine();
game.init();

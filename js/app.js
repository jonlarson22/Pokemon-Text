// js/app.js - Complete Route, Encounter, and Battle Manager
import { BattleEngine } from './battle.js';

class GameEngine {
  constructor() {
    this.gameState = {
      currentRoute: "route1",
      flags: {},
      party: [], // This will be populated in init()
      inventory: { "Potion": 1 },
      activeBattle: null
    };
    
    // Storing all our JSON data here
    this.db = {
      routes: {},
      pokemon: {},
      moves: {}
    };
  }

  async init() {
    // 1. Fetch all JSON files concurrently
    const [routesRes, pokemonRes, movesRes] = await Promise.all([
      fetch('./data/routes.json'),
      fetch('./data/pokemon.json'),
      fetch('./data/moves.json')
    ]);

    this.db.routes = await routesRes.json();
    this.db.pokemon = await pokemonRes.json();
    this.db.moves = await movesRes.json();

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
    // Ensure we are matching the lowercase keys in pokemon.json
    const safeId = speciesId.toLowerCase(); 
    const baseData = this.db.pokemon[safeId];
    
    if (!baseData) {
      console.error(`Missing data for species: ${speciesId}`);
      return null;
    }

    const hp = Math.floor((2 * baseData.baseStats.hp * level) / 100) + level + 10;
    
    return {
      species: baseData.name, // Using 'species' to match your battle logic
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
  }

// --- UI MENU CONTROLS ---
  setMenuState(menuName) {
    // Hide all menus first
    document.getElementById('route-actions').style.display = 'none';
    document.getElementById('system-menu').style.display = 'none';
    document.getElementById('travel-menu').style.display = 'none';
    document.getElementById('battle-actions').style.display = 'none';

    // Show the requested menu
    if (menuName === 'route') {
      document.getElementById('route-actions').style.display = 'grid';
    } else if (menuName === 'system') {
      document.getElementById('system-menu').style.display = 'grid';
    } else if (menuName === 'travel') {
      document.getElementById('travel-menu').style.display = 'flex';
      this.populateTravelMenu(); // Generate the buttons for destinations
    } else if (menuName === 'battle') {
      document.getElementById('battle-actions').style.display = 'grid';
    }
  }

  populateTravelMenu() {
    const container = document.getElementById('travel-destinations');
    container.innerHTML = ''; // Clear old buttons

    const currentRouteData = this.db.routes[this.gameState.currentRoute];
    if (!currentRouteData || !currentRouteData.connections) return;

    // Create a button for each connected route
    currentRouteData.connections.forEach(destinationId => {
      const destData = this.db.routes[destinationId];
      if (!destData) return;

      // Optional: Check if a flag (like an HM) is required to travel here
      if (destData.req_flag && !this.gameState.flags[destData.req_flag]) {
         // Could render a disabled button, or skip rendering entirely
         return; 
      }

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Go to ${destData.name}`;
      btn.onclick = () => {
        this.gameState.currentRoute = destinationId;
        this.renderRouteScreen();
        this.printToLog(`You traveled to ${destData.name}.`);
        this.setMenuState('route'); // Go back to main route menu
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
    // Convert the basic {species, level} into a full combatant
    const enemyMon = this.generatePokemonInstance(wildPokemonInfo.species, wildPokemonInfo.level);
    
    if (!enemyMon) {
      this.printToLog("Error generating wild Pokémon stats!");
      return;
    }

    this.printToLog(`A wild ${enemyMon.species} (Lv. ${enemyMon.level}) appeared!`);
    
    // Initialize the battle engine
    this.gameState.activeBattle = new BattleEngine(this.gameState.party[0], enemyMon, (msg) => {
      this.printToLog(msg);
      this.updatePartyUI();
    });

    // Populate Battle Buttons based on Player's moves
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

    this.setMenuState(true);
  }

  handleTurn(playerMove) {
    this.gameState.activeBattle.executeTurn(playerMove);
    
    if (this.gameState.activeBattle.isOver) {
      setTimeout(() => {
        this.printToLog("Returning to the route...");
        this.setMenuState(false);
      }, 2000);
    }
  }

// --- EVENT LISTENERS ---
  bindListeners() {
    // 1. Route Menu Buttons
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
      this.printToLog("No active trainer battle nearby right now.");
    });

    // 2. Swapping Menus
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

    // 3. System Menu Buttons
    document.getElementById('btn-save')?.addEventListener('click', () => {
      this.handleSaveLoad();
    });

    document.getElementById('btn-bag')?.addEventListener('click', () => {
      this.printToLog(`Inventory: ${JSON.stringify(this.gameState.inventory)}`);
    });

    document.getElementById('btn-pokedex')?.addEventListener('click', () => {
      this.printToLog("Pokédex feature coming soon!");
    });

    // 4. Battle Buttons
    document.getElementById('btn-run')?.addEventListener('click', () => {
      this.printToLog("Got away safely!");
      this.setMenuState('route'); // Notice we pass the string 'route' now
    });
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
      const encodedSave = btoa(saveData); // Encode to base64
      
      this.printToLog("SAVE SUCCESSFUL. Copy this string and save it somewhere safe:");
      this.printToLog(encodedSave);
      
      // Attempt to copy directly to the user's clipboard
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
    const saveString = window.prompt("Paste your base64 save string here:");
    if (!saveString) return; // User cancelled

    try {
      const decodedSave = atob(saveString); // Decode from base64
      const parsedState = JSON.parse(decodedSave);

      // Basic validation to make sure it's actually our game data
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

// Instantiate and initialize
const game = new GameEngine();
game.init();

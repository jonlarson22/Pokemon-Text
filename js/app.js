// js/app.js - Route, Encounter & Listener Manager

class GameEngine {
  constructor() {
    this.gameState = {
      currentRoute: "route1",
      flags: {},
      party: [
        { 
          species: "Charmander", 
          level: 5, 
          hp: 20, 
          maxHp: 20, 
          speed: 65, 
          attack: 12, 
          defense: 10,
          moves: [{ name: "Scratch", power: 40 }] 
        }
      ],
      inventory: { "Potion": 1 },
      activeBattle: null
    };
    this.routes = {};
  }

  async init() {
    const routeResponse = await fetch('./data/routes.json');
    this.routes = await routeResponse.json();

    // 1. Render initial UI state
    this.renderRouteScreen();
    this.printToLog("Welcome to the Kanto region!");

    // 2. Attach DOM Event Listeners
    this.bindListeners();
  }

  // Utility to append narrative output to UI display box
  printToLog(message) {
    const display = document.getElementById('display-area');
    if (!display) return;
    
    const p = document.createElement('p');
    p.className = 'log-entry';
    p.textContent = message;
    display.appendChild(p);
    display.scrollTop = display.scrollHeight; // Keep scrolled to bottom
  }

  // -------------------------------------------------------------
  // WHERE EVENT LISTENERS ARE UPDATED
  // -------------------------------------------------------------
  bindListeners() {
    // Wild Encounter Button
    document.getElementById('btn-encounter')?.addEventListener('click', () => {
      const result = this.triggerEncounter();
      if (typeof result === 'string') {
        this.printToLog(result);
      } else {
        this.printToLog(`A wild ${result.species} (Lv. ${result.level}) appeared in the tall grass!`);
      }
    });

    // Explore Button
    document.getElementById('btn-explore')?.addEventListener('click', () => {
      const result = this.triggerExplore();
      if (typeof result === 'string') {
        this.printToLog(result);
      } else if (result && result.species) {
        this.printToLog(`You were ambushed by a wild ${result.species} (Lv. ${result.level})!`);
      }
    });

    // Fight Button
    document.getElementById('btn-fight')?.addEventListener('click', () => {
      this.printToLog("No active trainer battle nearby right now.");
    });

    // Travel Button
    document.getElementById('btn-travel')?.addEventListener('click', () => {
      const route = this.routes[this.gameState.currentRoute];
      this.printToLog(`Available paths: ${route.connections.join(', ')}`);
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

  triggerEncounter() {
    const route = this.routes[this.gameState.currentRoute];
    if (!route || !route.encounters.length) return "No wild Pokémon nearby.";

    const selected = this.getWeightedRandom(route.encounters);
    const level = Math.floor(Math.random() * (selected.max_level - selected.min_level + 1)) + selected.min_level;

    return { species: selected.species, level: level };
  }

  triggerExplore() {
    const route = this.routes[this.gameState.currentRoute];
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

  renderRouteScreen() {
    const route = this.routes[this.gameState.currentRoute];
    const locationEl = document.getElementById('location-name');
    if (locationEl && route) locationEl.textContent = route.name;
  }
}

// Instantiate and initialize
const game = new GameEngine();
game.init();

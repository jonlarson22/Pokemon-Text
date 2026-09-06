// js/app.js - Route & Encounter Manager

class GameEngine {
  constructor() {
    this.gameState = {
      currentRoute: "route1",
      flags: {},
      party: [],
      inventory: { "Potion": 1 }
    };
    this.routes = {};
  }

  async init() {
    const routeResponse = await fetch('./data/routes.json');
    this.routes = await routeResponse.json();
    this.renderRouteScreen();
  }

  // Weighted random selection for encounter tables
  getWeightedRandom(items) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of items) {
      if (random < item.weight) return item;
      random -= item.weight;
    }
  }

  // Action: Encounter Wild Pokemon
  triggerEncounter() {
    const route = this.routes[this.gameState.currentRoute];
    if (!route || !route.encounters.length) return "No wild Pokémon nearby.";

    const selected = this.getWeightedRandom(route.encounters);
    const level = Math.floor(Math.random() * (selected.max_level - selected.min_level + 1)) + selected.min_level;

    return {
      species: selected.species,
      level: level
    };
  }

  // Action: Explore
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
    console.log(`Current Location: ${route.name}`);
    console.log(route.description);
  }
}

// Initialize on page load
const game = new GameEngine();
game.init();

export class UIManager {
  constructor(gameEngine) {
    this.game = gameEngine;
  }

  updateMoneyUI() {
    const moneyEl = document.getElementById('money-count');
    if (moneyEl) moneyEl.textContent = `Money: ¥${this.game.gameState.money}`;
  }

  updatePokedexTrackerUI() {
    const pokedexEl = document.getElementById('pokedex-count') || document.getElementById('pokedex-tracker');
    const pokemonDb = this.game.db.pokemon || {}; 
    const totalPokemon = Object.keys(pokemonDb).length || 151;
    const caughtCount = Object.keys(this.game.gameState.pokedex.caught).length;
  
    if (pokedexEl) pokedexEl.textContent = `Pokedex: ${caughtCount}/${totalPokemon}`;
  }

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
    const partyDisplay = document.getElementById('party-list');
    if (!partyDisplay) return;

    if (this.game.gameState.party.length === 0) {
      partyDisplay.textContent = "Party: Empty";
      return;
    }

    // Maps through every Pokemon in the party to create a string
    const partyStatus = this.game.gameState.party.map(mon => {
      // Optional: Add a little skull emoji or indicator if they are fainted
      const statusIcon = mon.hp <= 0 ? '💀' : ''; 
      return `${statusIcon}${mon.species} (Lv.${mon.level}) ${mon.hp}/${mon.maxHp}`;
    }).join('  |  '); // Separates party members with a pipe

    partyDisplay.textContent = `Party: ${partyStatus}`;
  }

renderRouteScreen() {
    const route = this.game.db.routes[this.game.gameState.currentRoute];
    const locationEl = document.getElementById('location-name');
    if (locationEl && route) locationEl.textContent = route.name;

    const centerBtn = document.getElementById('btn-pokemon-center');
    const shopBtn = document.getElementById('btn-shop');
    const interactBtn = document.getElementById('btn-interact'); // NEW
    const flyBtn = document.getElementById('btn-fly');           // NEW

    if (centerBtn) {
      centerBtn.style.display = route.hasCenter ? "block" : "none";
      centerBtn.onclick = () => this.game.facilities.openCenter();
    }

    if (shopBtn) {
      shopBtn.style.display = route.hasShop ? "block" : "none";
      shopBtn.onclick = () => this.game.facilities.openShop();
    }

    // NEW: Show interact button only if NPCs exist on this route
    if (interactBtn) {
      if (route.npcs && route.npcs.length > 0) {
        interactBtn.style.display = "block";
        interactBtn.onclick = () => this.buildInteractMenu(route.npcs);
      } else {
        interactBtn.style.display = "none";
      }
    }

    // NEW: Always show fly button, but logic handles if they can use it
    if (flyBtn) {
      flyBtn.style.display = "block";
      flyBtn.onclick = () => this.handleFlyAction();
    }
  }

  // UPDATED METHOD: Builds the dynamic menu for talking to NPCs
    buildInteractMenu(npcIds) {
      this.setMenuState('dynamic');
      const content = document.getElementById('dynamic-content');
      const controls = document.getElementById('dynamic-controls');
      
      // Clear previous menus and set a header
      content.innerHTML = '<p style="text-align:center; font-weight:bold; margin-bottom:8px;">Who would you like to talk to?</p>';
      controls.innerHTML = ''; 
  
      npcIds.forEach(npcId => {
        const npcData = this.game.db.npcs[npcId];
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = `Talk to ${npcData ? npcData.name : npcId}`;
        btn.onclick = () => {
          this.game.interactWithNPC(npcId); // Fires the logic in app.js
          this.setMenuState('route');       // Returns to route menu
        };
        content.appendChild(btn);
      });
  
      // Put the Cancel button in the controls area at the bottom
      this.buildMenuControls(controls, [
        { text: "Cancel", action: () => this.setMenuState('route') }
      ]);
    }
  
    // UPDATED METHOD: Builds the dynamic travel list based on visited towns
    handleFlyAction() {
      // Note: Make sure 'can_fly' matches the flag you actually set in your DB/Game!
      if (!this.game.hasFlag('can_fly')) {
         this.printToLog("You don't have the HM Fly yet!");
         return;
      }
  
      const towns = this.game.gameState.visitedTowns || [];
      if (towns.length <= 1) { 
         this.printToLog("You haven't visited any other towns to fly to!");
         return;
      }
  
      this.setMenuState('dynamic');
      const content = document.getElementById('dynamic-content');
      const controls = document.getElementById('dynamic-controls');
      
      content.innerHTML = '<p style="text-align:center; font-weight:bold; margin-bottom:8px;">Where would you like to fly?</p>';
      controls.innerHTML = '';
  
      towns.forEach(townId => {
        const townData = this.game.db.routes[townId];
        if (!townData) return;
  
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = `Fly to ${townData.name}`;
        btn.onclick = () => {
          this.printToLog(`You flew on your Pokémon to ${townData.name}!`);
          
          // Update location and re-render
          this.game.gameState.currentRoute = townId;
          this.renderRouteScreen(); 
          this.setMenuState('route');
        };
        content.appendChild(btn);
      });
  
      this.buildMenuControls(controls, [
        { text: "Cancel", action: () => this.setMenuState('route') }
      ]);
    }

  setMenuState(menuName) {
    document.getElementById('starter-menu').style.display = 'none';
    document.getElementById('party-select-menu').style.display = 'none';
    document.getElementById('route-actions').style.display = 'none';
    document.getElementById('system-menu').style.display = 'none';
    document.getElementById('travel-menu').style.display = 'none';
    document.getElementById('battle-actions').style.display = 'none';
    document.getElementById('dynamic-menu').style.display = 'none';

    if (menuName === 'route') document.getElementById('route-actions').style.display = 'grid';
    else if (menuName === 'system') document.getElementById('system-menu').style.display = 'grid';
    else if (menuName === 'travel') {
      document.getElementById('travel-menu').style.display = 'flex';
      this.game.populateTravelMenu(); // Calls back to game to handle the logic
    } 
    else if (menuName === 'battle') document.getElementById('battle-actions').style.display = 'grid';
    else if (menuName === 'dynamic') document.getElementById('dynamic-menu').style.display = 'flex';
    else if (menuName === 'starter') document.getElementById('starter-menu').style.display = 'flex';
    else if (menuName === 'party-select') document.getElementById('party-select-menu').style.display = 'flex';
  }

  buildMenuControls(container, buttons) {
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.flex = "1";
      btn.textContent = b.text;
      btn.onclick = b.action;
      container.appendChild(btn);
    });
  }
}

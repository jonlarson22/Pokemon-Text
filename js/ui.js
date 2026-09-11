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

  // MOVED FROM APP.JS
  openPokemonMenu() {
    this.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    if (this.game.gameState.party.length === 0) {
      content.innerHTML = '<p style="text-align:center;">You have no Pokémon in your party.</p>';
    } else {
      this.game.gameState.party.forEach((mon, index) => {
        const pbox = document.createElement('div');
        pbox.style.border = this.game.partySwapIndex === index ? "2px solid red" : "1px solid #ccc";
        pbox.style.padding = "8px";
        pbox.style.marginBottom = "8px";
        pbox.style.cursor = "pointer";
        
        pbox.innerHTML = `
          <strong>${mon.species} (Lv. ${mon.level})</strong> - ${mon.types.join('/')}<br>
          HP: ${mon.hp}/${mon.maxHp} | EXP: ${mon.exp}/${mon.maxExp}<br>
          Moves: ${mon.moves.map(m => m.name).join(', ')}
        `;
        
        pbox.onclick = () => {
          if (this.game.partySwapIndex !== null) {
            if (this.game.partySwapIndex !== index) {
              const temp = this.game.gameState.party[this.game.partySwapIndex];
              this.game.gameState.party[this.game.partySwapIndex] = this.game.gameState.party[index];
              this.game.gameState.party[index] = temp;
              this.printToLog(`Swapped ${this.game.gameState.party[index].species} and ${this.game.gameState.party[this.game.partySwapIndex].species}.`);
            }
            this.game.partySwapIndex = null;
            this.updatePartyUI();
            this.openPokemonMenu();
          } else {
            this.game.partySwapIndex = index;
            this.openPokemonMenu();
          }
        };
        content.appendChild(pbox);
      });
    }

    this.buildMenuControls(controls, [
      { text: this.game.partySwapIndex !== null ? "Cancel Swap" : "Close", action: () => {
          if (this.game.partySwapIndex !== null) {
            this.game.partySwapIndex = null;
            this.openPokemonMenu();
          } else {
            this.setMenuState('system');
          }
      }}
    ]);
  }

  // MOVED FROM APP.JS
  openPokedex() {
    this.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    const seenKeys = Object.keys(this.game.gameState.pokedex.seen);

    if (seenKeys.length === 0) {
      content.innerHTML = '<p style="text-align:center;">No Pokémon seen yet!</p>';
    } else {
      const entries = seenKeys.map(key => {
        const data = this.game.db.pokemon[key];
        return {
          id: key,
          pokedexNumber: data ? data.pokedexNumber : 999,
          name: data ? data.name : key.toUpperCase()
        };
      }).sort((a, b) => a.pokedexNumber - b.pokedexNumber);

      entries.forEach(entry => {
        const p = document.createElement('p');
        const isCaught = this.game.gameState.pokedex.caught[entry.id];
        const numStr = String(entry.pokedexNumber).padStart(3, '0');
        p.textContent = `#${numStr} ${isCaught ? '🔴' : '⚫'} ${entry.name}`;
        content.appendChild(p);
      });
    }

    this.buildMenuControls(controls, [
      { text: "Close", action: () => this.setMenuState('system') }
    ]);
  }

  // MOVED FROM APP.JS
  refreshBattleMoveButtons() {
    const activeMon = this.game.gameState.party[0];
    const leadMoves = activeMon.moves;
    
    for (let i = 0; i < 4; i++) {
      const btn = document.getElementById(`btn-move-${i}`);
      const move = leadMoves[i];

      if (btn && move) {
        btn.textContent = move.maxPp !== undefined ? `${move.name} (${move.pp}/${move.maxPp})` : move.name;

        if (move.pp !== undefined && move.pp <= 0) {
          btn.disabled = true;
          btn.style.opacity = "0.5";
          btn.onclick = null;
        } else {
          btn.disabled = false;
          btn.style.opacity = "1";
          btn.onclick = () => this.game.battleManager.handleTurn(move); // Calls BattleManager!
        }
        btn.style.display = "block";
      } else if (btn) {
        btn.style.display = "none";
      }
    }
  }

  // MOVED FROM APP.JS
  handleItemClick(itemKey) {
    const item = this.game.db.items[itemKey]; 
    if (item.category === "catch") { 
      if (this.game.gameState.activeBattle) {
        this.game.captureSystem.attemptCatch(itemKey);
      } else {
        this.printToLog("Oak's words echoed: There's a time and place for everything, but not now.");
      }
    } else if (item.category === "healing") { 
      this.openPartyTargetScreen(itemKey, item);
    }
  }

  // MOVED FROM APP.JS
  openPartyTargetScreen(itemKey, itemData) {
    this.setMenuState('party-select');
    const container = document.getElementById('party-select-list');
    container.innerHTML = '';

    this.game.gameState.party.forEach((mon, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.innerText = `${mon.species} (HP: ${mon.hp}/${mon.maxHp})`;
      btn.onclick = () => this.applyItemToPokemon(itemKey, itemData, index);
      container.appendChild(btn);
    });
  }

  // MOVED FROM APP.JS
  applyItemToPokemon(itemKey, itemData, partyIndex) {
    const target = this.game.gameState.party[partyIndex];

    if (itemData.effect.type === "heal") { 
      if (target.hp >= target.maxHp) {
        this.printToLog("It won't have any effect.");
        return; 
      }
      target.hp = Math.min(target.maxHp, target.hp + itemData.effect.value); 
      this.printToLog(`You used a ${itemData.name}! ${target.species} recovered health.`);
    }

    this.game.gameState.inventory[itemKey]--;
    if (this.game.gameState.inventory[itemKey] <= 0) delete this.game.gameState.inventory[itemKey];
    this.updatePartyUI();

    if (this.game.gameState.activeBattle) {
      this.setMenuState('battle');
      const enemyMove = this.game.gameState.activeBattle.getRandomEnemyMove();
      this.game.gameState.activeBattle.processAction(this.game.gameState.activeBattle.enemyMon, this.game.gameState.party[0], enemyMove, false);
      this.game.gameState.activeBattle.checkWinLoss();

      if (this.game.gameState.activeBattle.isOver) {
        this.game.battleManager.handleBattleEnd();
      }
    } else {
      this.setMenuState('system'); 
    }
  }

  // MOVED FROM APP.JS
  travelTo(targetRouteId) {
    const currentRoute = this.game.db.routes[this.game.gameState.currentRoute];
    const targetRoute = this.game.db.routes[targetRouteId];

    if (currentRoute.forced_battle && !this.game.hasFlag(currentRoute.forced_battle.flag)) {
      const trainer = this.game.factory.getDynamicTrainer(currentRoute.forced_battle.trainer_id);
      this.printToLog(`Wait! ${trainer.name} steps out to challenge you!`);
      this.printToLog(`"${trainer.dialogueBefore || 'Let us battle!'}"`);
      
      this.game.gameState.activeTrainerPartyIndex = 0; 

      const enemyMonData = trainer.party[0];
      const enemyMon = this.game.factory.generatePokemonInstance(enemyMonData.species, enemyMonData.level);

      this.game.battleManager.startTrainerBattle(enemyMon, trainer, currentRoute.forced_battle.flag);
      return false;
    }

    if (currentRoute.gate_requirements && currentRoute.gate_requirements[targetRouteId]) {
      const gate = currentRoute.gate_requirements[targetRouteId];
      const satisfiesReqs = gate.required_flags.every(flag => this.game.hasFlag(flag));
      
      if (!satisfiesReqs) {
        this.printToLog(gate.blocked_message);
        return false; 
      }
    }

    this.game.gameState.currentRoute = targetRouteId;
    this.game.trackVisitedTown(targetRouteId); // Leave trackVisitedTown in app.js as a core logic state-tracker
    
    this.printToLog(`Arrived at ${targetRoute.name}.`);
    this.renderRouteScreen();
    this.setMenuState('route');
    return true;
  }
}

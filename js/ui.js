export class UIManager {
  constructor(gameEngine) {
    this.game = gameEngine;
  }

  updateMoneyUI() {
    const moneyEl = document.getElementById('money-count');
    if (moneyEl) {
      const coins = this.game.gameState.coins || 0;
      const coinText = (coins > 0 || this.game.hasFlag('obtained_coin_case'))
        ? ` · Coins: ${coins}` : '';
      moneyEl.textContent = `Money: ¥${this.game.gameState.money}${coinText}`;
    }
  }

  updateBadgeUI() {
    const badgeEl = document.getElementById('badge-count');
    if (badgeEl) {
      const badges = ['boulder_badge', 'cascade_badge', 'thunder_badge', 'rainbow_badge',
                      'soul_badge', 'marsh_badge', 'volcano_badge', 'earth_badge'];
      const count = badges.filter(b => this.game.hasFlag(b)).length;
      badgeEl.textContent = `Badges: ${count}/8`;
    }
  }

  // Yes/no choice menu (e.g. "Press the hidden switch? Who wouldn't?").
  openChoiceMenu(choice) {
    this.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = `<p style="text-align:center; font-weight:bold; margin-bottom:8px;">${choice.prompt}</p>`;
    controls.innerHTML = '';

    this.buildMenuControls(controls, [
      { text: choice.yes_label || "Yes", action: () => {
          if (choice.onYes) { choice.onYes(); }
          else {
            if (choice.flag) this.game.setFlag(choice.flag, true);
            this.printToLog(choice.success || "Done.");
          }
          this.setMenuState('route');
      } },
      { text: choice.no_label || "No", action: () => {
          this.printToLog(choice.decline || "You leave it alone.");
          this.setMenuState('route');
      } },
    ]);
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
    p.textContent = this.substituteNames(message);
    display.appendChild(p);
    display.scrollTop = display.scrollHeight;
  }

  // Replace {player} / {rival} tokens with the names chosen at game start
  // (defaults keep old dialogue working if names were never set).
  substituteNames(text) {
    if (typeof text !== 'string') return text;
    const gs = this.game && this.game.gameState ? this.game.gameState : {};
    return text
      .replaceAll('{player}', gs.playerName || 'Red')
      .replaceAll('{rival}', gs.rivalName || 'Blue');
  }

  // --- New-game flow: title -> Oak intro -> names -> stopped at Route 1 -> starter pick ---
  // The title screen hides the game HUD (location, money, party, log box):
  // none of it means anything until the player picks New / Load / Import.
  setHudVisible(visible) {
    const disp = visible ? '' : 'none';
    for (const id of ['status-bar', 'display-area', 'party-bar']) {
      const el = document.getElementById(id);
      if (el) el.style.display = disp;
    }
  }

  showTitleScreen() {
    this.setHudVisible(false);
    this.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = `<p style="text-align:center;font-weight:bold;font-size:2em;margin:0.6em 0 0">Pokémon Text</p>
      <p style="text-align:center;font-size:1.1em">A text adventure through the Kanto region.</p>`;
    controls.innerHTML = '';
    this.buildMenuControls(controls, [
      { text: "New Game", action: () => this.showIntro() },
      { text: "Load Local", action: () => this.game.storage.loadLocal() },
      { text: "Import Save", action: () => document.getElementById('input-import-file').click() },
    ]);
  }

  showIntro() {
    this.setHudVisible(true);
    this.setMenuState('dynamic');
    // Story text goes to the log box; the menu area holds only the button.
    // Oak's intro populates line by line, Pokemon-style. Tapping Continue
    // skips the timer and prints any remaining lines instantly.
    document.getElementById('dynamic-content').innerHTML = '';
    const controls = document.getElementById('dynamic-controls');
    controls.innerHTML = '';
    const lines = [
      "Oak: Hello there! Welcome to the world of Pokémon!",
      "Oak: I'm Oak, the Pokémon Professor.",
      "Oak: This world is full of Pokémon — pets to some, battlers to others.",
      "Oak: I study them as a profession.",
      "Oak: Your own journey is about to begin — a world of dreams and adventures awaits!",
    ];
    let i = 0;
    const timer = setInterval(() => {
      if (i < lines.length) {
        this.printToLog(lines[i++]);
      } else {
        clearInterval(timer);
        this._introTimer = null;
      }
    }, 650);
    this._introTimer = timer;
    this.buildMenuControls(controls, [
      { text: "Continue", action: () => {
          if (this._introTimer) { clearInterval(this._introTimer); this._introTimer = null; }
          while (i < lines.length) this.printToLog(lines[i++]);
          this.showNameEntry();
      } },
    ]);
  }

  showNameEntry() {
    this.setMenuState('dynamic');
    this.printToLog("Oak: First, tell me a little about yourself. What is your name?");
    this.printToLog("Oak: And this is my grandson. He's been your rival since you were both babies... What was his name again?");
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = `<p style="text-align:center"><b>Your name:</b></p>
      <input id="input-player-name" maxlength="10" placeholder="Red" style="width:100%;box-sizing:border-box;padding:10px 4px;font-size:1em;text-align:center" />
      <p style="text-align:center;margin-top:12px"><b>Your rival's name:</b></p>
      <input id="input-rival-name" maxlength="10" placeholder="Blue" style="width:100%;box-sizing:border-box;padding:10px 4px;font-size:1em;text-align:center" />`;
    controls.innerHTML = '';
    this.buildMenuControls(controls, [
      { text: "Begin your journey!", action: () => {
          const pEl = document.getElementById('input-player-name');
          const rEl = document.getElementById('input-rival-name');
          const p = (pEl && pEl.value.trim()) || 'Red';
          const r = (rEl && rEl.value.trim()) || 'Blue';
          this.game.gameState.playerName = p.slice(0, 10);
          this.game.gameState.rivalName = r.slice(0, 10);
          this.printToLog("Oak: {player}! And {rival}! Of course — how could I forget? Now, off you go!");
          this.showOakStopsYou();
      } },
    ]);
  }

  showOakStopsYou() {
    this.setMenuState('dynamic');
    this.printToLog("You leave your house, full of excitement, and stride toward the tall grass of Route 1...");
    document.getElementById('dynamic-content').innerHTML = '';
    const controls = document.getElementById('dynamic-controls');
    controls.innerHTML = '';
    this.buildMenuControls(controls, [
      { text: "Step onto Route 1", action: () => {
          this.printToLog("Oak: Hey! Wait! Don't go out there!");
          this.printToLog("Oak: It's unsafe! Wild Pokémon live in the tall grass! You need your own Pokémon for your protection.");
          this.printToLog("Oak: Come with me to my lab! I'll give you a Pokémon partner to keep you safe.");
          this.showStarterPick();
      } },
    ]);
  }

  showStarterPick() {
    this.setMenuState('dynamic');
    this.printToLog("Oak: Choose your Pokémon partner!");
    document.getElementById('dynamic-content').innerHTML = '';
    const controls = document.getElementById('dynamic-controls');
    controls.innerHTML = '';
    this.buildMenuControls(controls, [
      { text: "Bulbasaur", action: () => this.game.factory.pickStarter('bulbasaur') },
      { text: "Charmander", action: () => this.game.factory.pickStarter('charmander') },
      { text: "Squirtle", action: () => this.game.factory.pickStarter('squirtle') },
    ]);
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
    const interactBtn = document.getElementById('btn-interact');
    const flyBtn = document.getElementById('btn-fly');

    if (centerBtn) {
      centerBtn.style.display = route.hasCenter ? "block" : "none";
      centerBtn.onclick = () => this.game.facilities.openCenter();
    }

    if (shopBtn) {
      // A route can point its shop button at another route's shop (e.g.
      // Celadon City -> the Department Store) with a custom label.
      const shopId = route.shopId || (route.hasShop ? this.game.gameState.currentRoute : null);
      shopBtn.style.display = shopId ? "block" : "none";
      if (shopId) {
        shopBtn.textContent = route.shopLabel || "Poké Mart";
        shopBtn.onclick = () => this.game.facilities.openShop(shopId);
      }
    }

    if (interactBtn) {
      interactBtn.style.display = "block";
      interactBtn.onclick = () => {
        if (route && route.npcs && route.npcs.length > 0) {
          this.buildInteractMenu(route.npcs);
        } else {
          this.printToLog("There is no one to talk to right now.");
        }
      };
    }

    if (flyBtn) {
      flyBtn.style.display = "block";
      flyBtn.onclick = () => this.handleFlyAction();
    }
  }

    buildInteractMenu(npcIds) {
      this.setMenuState('dynamic');
      const content = document.getElementById('dynamic-content');
      const controls = document.getElementById('dynamic-controls');

      content.innerHTML = '<p style="text-align:center; font-weight:bold; margin-bottom:8px;">Who would you like to talk to?</p>';
      controls.innerHTML = ''; 
  
      const removedHere = (this.game.gameState.removedNPCs || {})[this.game.gameState.currentRoute] || [];
      const visibleIds = npcIds.filter(npcId => {
        const npcData = this.game.db.npcs[npcId];
        if (!npcData) return true; // placeholder for an NPC that isn't written yet
        if (npcData.req_flag_to_appear && !this.game.hasFlag(npcData.req_flag_to_appear)) return false;
        if (npcData.req_flag_to_disappear && this.game.hasFlag(npcData.req_flag_to_disappear)) return false;
        if (removedHere.includes(npcId)) return false;
        return true;
      });

      if (visibleIds.length === 0) {
        this.printToLog("There is no one to talk to right now.");
        this.setMenuState('route');
        return;
      }

      visibleIds.forEach(npcId => {
        const npcData = this.game.db.npcs[npcId];
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = `Talk to ${npcData ? npcData.name : npcId}`;
        btn.onclick = () => {
          this.game.interactions.processNPC(npcId);
          this.setMenuState('route');
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
      // Field use of Fly is unlocked by HM02 (Route 16, after the Snorlax)
      // and requires the Thunder Badge (canon RBY).
      if (!this.game.hasFlag('obtained_hm02') || !this.game.hasFlag('thunder_badge')) {
         this.printToLog("You don't have the HM Fly yet, or you lack the badge to use it!");
         return;
      }

      const currentRouteData = this.game.db.routes[this.game.gameState.currentRoute];
      if (currentRouteData && currentRouteData.noFly) {
         this.printToLog("You need open sky above you to fly!");
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
        if (townId === this.game.gameState.currentRoute) return;
        const townData = this.game.db.routes[townId];
        if (!townData) return;

        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = `Fly to ${townData.name}`;
        btn.onclick = () => {
          // Route through travelTo so forced battles and gate
          // requirements are checked exactly like walking there.
          if (this.travelTo(townId)) {
            this.printToLog(`You flew on your Pokémon to ${townData.name}!`);
          }
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

  // Safari Zone minigame menu: Ball / Bait / Rock / Run (no fighting).
  // Rebuilt after every safari turn via battleManager.
  openSafariMenu() {
    const sb = this.game.gameState.safariBattle;
    if (!sb) {
      this.setMenuState('route');
      return;
    }
    const balls = this.game.gameState.safariBalls || 0;
    const moodText = sb.eating > 0 ? "It is eating." : sb.angry > 0 ? "It is angry!" : "It is watching carefully.";
    this.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = `<p style="text-align:center; font-weight:bold;">Wild ${sb.enemy.species} (Lv. ${sb.enemy.level})<br><span style="font-weight:normal;">${moodText}</span></p>`;
    controls.innerHTML = '';

    this.buildMenuControls(controls, [
      {
        text: `Throw Safari Ball (${balls} left)`,
        action: () => this.game.battleManager.safariThrowBall(),
      },
      { text: "Throw Bait", action: () => this.game.battleManager.safariThrowBait() },
      { text: "Throw Rock", action: () => this.game.battleManager.safariThrowRock() },
      { text: "Run", action: () => this.game.battleManager.safariRun() },
    ]);
  }

  // Baton Pass needs a switch target chosen before the turn runs. Lists
  // conscious benched party mons; the choice is stashed on the battle and
  // consumed by the baton_pass effect when the move executes in turn order.
  openBatonPassChooser(move) {
    const battle = this.game.gameState.activeBattle;
    if (!battle) return;
    const active = battle.playerMon;
    const candidates = this.game.gameState.party.filter(m => m && m.hp > 0 && m !== active);
    if (candidates.length === 0) {
      this.printToLog(`But it failed! There's no one to pass to!`);
      return;
    }
    this.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '<p style="text-align:center; font-weight:bold;">Pass to which Pokémon?</p>';
    controls.innerHTML = '';

    const buttons = candidates.map(mon => ({
      text: `${mon.species} (Lv. ${mon.level}) — ${mon.hp}/${mon.maxHp} HP`,
      action: () => {
        this.setMenuState('battle');
        this.game.battleManager.handleTurn(move, mon);
      }
    }));
    buttons.push({
      text: "Cancel",
      action: () => this.setMenuState('battle')
    });
    this.buildMenuControls(controls, buttons);
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

      if (btn) {
        if (move) {
          // Fallback: If maxPp is undefined (like on Ember), use its base pp
          const maxPp = move.maxPp !== undefined ? move.maxPp : move.pp;
          
          btn.textContent = maxPp !== undefined ? `${move.name} (${move.pp}/${maxPp})` : move.name;

          if (move.pp !== undefined && move.pp <= 0) {
            btn.disabled = true;
            btn.style.opacity = "0.5";
            btn.onclick = null;
          } else {
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.onclick = move.name === "Baton Pass"
              ? () => this.openBatonPassChooser(move)
              : () => this.game.battleManager.handleTurn(move);
          }
        } else {
          // Handle Empty Move Slots
          btn.textContent = "(Empty Move)";
          btn.disabled = true;
          btn.style.opacity = "0.5";
          btn.onclick = null;
        }
        
        // Ensure the button is always visible
        btn.style.display = "block";
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
    } else if (item.category === "healing" || item.category === "revival" || item.category === "status") {
      this.openPartyTargetScreen(itemKey, item);
    } else if (item.effect && item.effect.type === "awaken_sleeping_pokemon") {
      this.usePokeFlute(itemKey, item);
    } else if (item.category === "tm" || item.category === "hm") {
      if (this.game.gameState.activeBattle) {
        this.printToLog("You can't use a TM or HM in battle!");
        return;
      }
      this.openTeachMenu(itemKey, item);
    } else if (item.effect && item.effect.type === "evolve") {
      if (this.game.gameState.activeBattle) {
        this.printToLog("You can't use that in battle!");
        return;
      }
      this.openEvolveTargetScreen(itemKey, item);
    } else if (item.effect && item.effect.type === "repel_wild") {
      if (this.game.gameState.activeBattle) {
        this.printToLog("You can't use that in battle!");
        return;
      }
      this.useRepel(itemKey, item);
    } else if (item.effect && item.effect.type === "escape_cave") {
      if (this.game.gameState.activeBattle) {
        this.printToLog("You can't use that in battle!");
        return;
      }
      this.useEscapeRope(itemKey, item);
    }
  }

  // --- Escape Rope ----------------------------------------------------------
  // Returns to the last visited Pokémon Center. No healing, no money loss
  // (unlike blacking out).
  useEscapeRope(itemKey, itemData) {
    const dest = this.game.gameState.lastHealedLocation || "pallet_town";
    this.game.gameState.inventory[itemKey]--;
    if (this.game.gameState.inventory[itemKey] <= 0) delete this.game.gameState.inventory[itemKey];
    this.printToLog(`You used an ${itemData.name}!`);
    this.travelTo(dest);
  }

  // --- Repels -------------------------------------------------------------
  // Repel filters wild encounters to mons at/above the lead mon's level and
  // lasts a fixed number of encounter rolls (Repel 3 / Super 5 / Max 10).
  useRepel(itemKey, itemData) {
    const n = (itemData.effect && itemData.effect.encounters) || 3;
    this.game.gameState.repel = { encountersLeft: n };
    this.game.gameState.inventory[itemKey]--;
    if (this.game.gameState.inventory[itemKey] <= 0) delete this.game.gameState.inventory[itemKey];
    this.printToLog(`You used a ${itemData.name}! Weaker wild Pokémon will stay away for ${n} encounters.`);
    this.game.openBag();
  }

  // --- Evolution stones / Linking Cord ------------------------------------
  // Resolves which species a stone/cord evolves a given mon into (null if
  // incompatible). Supports single-target item evolutions and Eevee's
  // stone-choice map.
  evolutionTargetForItem(monId, itemKey) {
    const base = this.game.db.pokemon[(monId || '').toLowerCase()];
    const evo = base && base.evolution;
    if (!evo) return null;
    if ((evo.method === 'item' || evo.method === 'use_item') && evo.item === itemKey) return evo.target;
    if (evo.method === 'item_choice' && evo.choices && evo.choices[itemKey]) return evo.choices[itemKey];
    return null;
  }

  openEvolveTargetScreen(itemKey, itemData) {
    const targets = (itemData.effect && itemData.effect.target) || [];
    const candidates = [];
    this.game.gameState.party.forEach((mon, index) => {
      const id = (mon.id || mon.species || '').toLowerCase();
      if (targets.includes(id) && this.evolutionTargetForItem(id, itemKey)) {
        candidates.push({ mon, index });
      }
    });
    if (!candidates.length) {
      this.printToLog("It won't have any effect.");
      return;
    }
    this.setMenuState('party-select');
    const container = document.getElementById('party-select-list');
    container.innerHTML = '';
    candidates.forEach(({ mon, index }) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.innerText = `${mon.species} (Lv. ${mon.level})`;
      btn.onclick = () => {
        this.game.gameState.inventory[itemKey]--;
        if (this.game.gameState.inventory[itemKey] <= 0) delete this.game.gameState.inventory[itemKey];
        this.printToLog(`You used a ${itemData.name} on ${mon.species}!`);
        this.game.growth.checkEvolution(this.game.gameState.party[index], 'item', itemKey);
      };
      container.appendChild(btn);
    });
  }

  // --- Poke Flute: waking -----------------------------------------------
  // Canon: usable in battle to wake the player's sleeping active Pokemon.
  // Playing it takes your turn (the foe moves afterwards). Key item: never
  // consumed. Out of battle it's just a soothing melody.
  usePokeFlute(itemKey, item) {
    if (this.game.gameState.activeBattle) {
      const active = this.game.gameState.party[0];
      if (!active || active.status !== "SLP") {
        this.printToLog("It won't have any effect.");
        return;
      }
      active.status = null;
      this.printToLog(`You played the ${item.name}! ${active.species} woke up!`);
      this.setMenuState('battle');
      const enemyMove = this.game.gameState.activeBattle.getRandomEnemyMove();
      this.game.gameState.activeBattle.processAction(this.game.gameState.activeBattle.enemyMon, this.game.gameState.party[0], enemyMove, false);
      this.game.gameState.activeBattle.checkWinLoss();

      if (this.game.gameState.activeBattle.isOver) {
        this.game.battleManager.handleBattleEnd();
      }
    } else {
      this.printToLog("You play a soothing melody on the Poké Flute...");
    }
  }

  // --- TM / HM teaching --------------------------------------------------
  // TMs and HMs are both reusable (never consumed) and HMs can be
  // forgotten/overwritten like any other move — unlike the original games.
  // Compatibility is gated on the canon tmMoves list in pokemon.json.

  // Pure-ish helpers (no DOM) so the teach logic is unit-testable.
  resolveTeachMove(itemData) {
    const moveId = (itemData.effect && itemData.effect.move) || itemData.move;
    if (!moveId) return null;
    const moveDef = this.game.db.moves[moveId];
    if (!moveDef) return null;
    return { moveId, moveDef };
  }

  canLearnMachine(mon, moveId) {
    const baseData = this.game.db.pokemon[mon.id];
    if (!baseData || !baseData.tmMoves) return false;
    if (baseData.tmMoves.includes(moveId)) return true;
    // Fallback: if NO pokemon in pokemon.json lists this move in tmMoves,
    // there is no compat data for it yet (e.g. RBY-only TMs whose canon
    // learnsets haven't been entered). Allow everyone so the TM still works,
    // and log it for the dev data pass.
    if (!this._tmCompatUnion) {
      this._tmCompatUnion = new Set();
      Object.values(this.game.db.pokemon).forEach(p => {
        (p.tmMoves || []).forEach(m => this._tmCompatUnion.add(m));
      });
    }
    if (!this._tmCompatUnion.has(moveId)) {
      console.warn(`[dev] no tmMoves compat data for "${moveId}" — allowing all learners for now.`);
      return true;
    }
    return false;
  }

  monKnowsMove(mon, moveId, moveName) {
    return (mon.moves || []).some(m => m.moveId === moveId || m.name === moveName);
  }

  makeTaughtMove(moveId, moveDef) {
    return { ...moveDef, moveId, maxPp: moveDef.pp, pp: moveDef.pp };
  }

  // Shows the party so the player can pick who learns the move.
  openTeachMenu(itemKey, itemData) {
    const resolved = this.resolveTeachMove(itemData);
    if (!resolved) {
      console.warn(`[dev] "${itemKey}" has no teachable move in items.json.`);
      this.printToLog("That doesn't seem to teach anything...");
      return;
    }
    const { moveId, moveDef } = resolved;

    this.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = `<p style="text-align:center; font-weight:bold; margin-bottom:8px;">Teach ${moveDef.name} to which Pokémon?</p>`;
    controls.innerHTML = '';

    this.game.gameState.party.forEach((mon, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';

      if (this.monKnowsMove(mon, moveId, moveDef.name)) {
        btn.textContent = `${mon.species} (already knows it)`;
        btn.onclick = () => {
          this.printToLog(`${mon.species} already knows ${moveDef.name}!`);
        };
      } else if (!this.canLearnMachine(mon, moveId)) {
        btn.textContent = `${mon.species} (can't learn it)`;
        btn.disabled = true;
        btn.style.opacity = "0.5";
      } else {
        btn.textContent = mon.species;
        btn.onclick = () => this.teachMoveToMon(itemKey, itemData, moveId, moveDef, index);
      }
      content.appendChild(btn);
    });

    this.buildMenuControls(controls, [
      { text: "Cancel", action: () => this.game.openBag() }
    ]);
  }

  // Separate TM/HM submenu: one bag entry opens this, sorted by number
  // (TM01..TM84, then HM01..HM07). Each button routes through
  // handleItemClick so the normal teach flow applies.
  openMachineMenu(entries) {
    const numOf = key => parseInt((key.match(/\d+/) || [0])[0], 10);
    const rank = key => (this.game.db.items[key]?.category === 'hm' ? 1000 : 0) + numOf(key);
    const sorted = [...entries].sort((a, b) => rank(a[0]) - rank(b[0]));

    this.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = `<p style="text-align:center; font-weight:bold; margin-bottom:8px;">TMs &amp; HMs</p>`;
    controls.innerHTML = '';

    sorted.forEach(([itemKey, qty]) => {
      const item = this.game.db.items[itemKey];
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `${item.name} ×${qty}`;
      btn.title = item.description || '';
      btn.onclick = () => this.handleItemClick(itemKey);
      content.appendChild(btn);
    });

    this.buildMenuControls(controls, [
      { text: "Back", action: () => this.game.openBag() }
    ]);
  }

  // Applies the taught move: empty slot learns it directly, a full
  // moveset prompts for a move to forget (HMs included — they are NOT
  // permanent here). TMs/HMs are never consumed.
  teachMoveToMon(itemKey, itemData, moveId, moveDef, partyIndex) {
    const mon = this.game.gameState.party[partyIndex];

    if (this.monKnowsMove(mon, moveId, moveDef.name)) {
      this.printToLog(`${mon.species} already knows ${moveDef.name}!`);
      return;
    }

    if ((mon.moves || []).length < 4) {
      mon.moves.push(this.makeTaughtMove(moveId, moveDef));
      this.printToLog(`${mon.species} learned ${moveDef.name}!`);
      this.updatePartyUI();
      this.game.openBag();
    } else {
      this.promptTeachMoveReplacement(mon, moveId, moveDef, itemKey, itemData);
    }
  }

  // Pure-ish (no DOM): swaps a move slot for the taught move. Returns the
  // forgotten move's name for the log line.
  applyTeachReplacement(mon, slotIndex, moveId, moveDef) {
    const oldMoveName = mon.moves[slotIndex].name;
    mon.moves[slotIndex] = this.makeTaughtMove(moveId, moveDef);
    return oldMoveName;
  }

  promptTeachMoveReplacement(mon, moveId, moveDef, itemKey, itemData) {
    this.printToLog(`${mon.species} is trying to learn ${moveDef.name}...`);
    this.printToLog(`But ${mon.species} can only know 4 moves!`);

    this.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '<p style="text-align:center;">Select a move to forget:</p>';
    controls.innerHTML = '';

    mon.moves.forEach((currentMove, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Forget ${currentMove.name}`;
      btn.onclick = () => {
        const oldMoveName = this.applyTeachReplacement(mon, index, moveId, moveDef);
        this.printToLog(`1, 2, and... Poof! ${mon.species} forgot ${oldMoveName} and learned ${moveDef.name}!`);
        this.updatePartyUI();
        this.game.openBag();
      };
      content.appendChild(btn);
    });

    this.buildMenuControls(controls, [
      {
        text: "Don't Teach",
        action: () => {
          this.printToLog(`${mon.species} gave up on learning ${moveDef.name}.`);
          this.openTeachMenu(itemKey, itemData);
        }
      }
    ]);
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

  // --- Healing / revival / status items -------------------------------------
  // Returns true if the item had an effect (and applies it). Prints the result
  // or "It won't have any effect." and returns false when nothing happens --
  // in which case the item is NOT consumed.
  applyHealingEffect(target, itemData) {
    const effect = itemData.effect || {};
    const type = effect.type;
    const STATUS_MAP = { poison: 'PSN', burn: 'BRN', freeze: 'FRZ', sleep: 'SLP', paralysis: 'PAR' };

    if (type === 'heal' || type === 'heal_and_cure') {
      if (target.hp <= 0) { this.printToLog("It won't have any effect."); return false; }
      const fullHp = target.hp >= target.maxHp;
      if (fullHp && type === 'heal') { this.printToLog("It won't have any effect."); return false; }
      if (fullHp && !target.status) { this.printToLog("It won't have any effect."); return false; }
      const amount = effect.value === 'max' ? target.maxHp : effect.value;
      target.hp = Math.min(target.maxHp, target.hp + amount);
      if (type === 'heal_and_cure') target.status = null;
      this.printToLog(`You used a ${itemData.name}! ${target.species} recovered health.`);
      return true;
    }
    if (type === 'revive') {
      if (target.hp > 0) { this.printToLog("It won't have any effect."); return false; }
      target.hp = effect.value === 'max' ? target.maxHp : Math.floor(target.maxHp / 2);
      target.status = null;
      this.printToLog(`You used a ${itemData.name}! ${target.species} was revived!`);
      return true;
    }
    if (type === 'cure_status') {
      const want = effect.status;
      if (!target.status || (want !== 'all' && target.status !== STATUS_MAP[want])) {
        this.printToLog("It won't have any effect."); return false;
      }
      this.printToLog(`You used a ${itemData.name}! ${target.species} was cured!`);
      target.status = null;
      return true;
    }
    return false;
  }

  // MOVED FROM APP.JS
  applyItemToPokemon(itemKey, itemData, partyIndex) {
    const target = this.game.gameState.party[partyIndex];

    if (!this.applyHealingEffect(target, itemData)) {
      return;
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

    if (!targetRoute) {
      console.warn(`[dev] "${targetRouteId}" is not in routes.json yet.`);
      this.printToLog("That path isn't built yet. Check back soon!");
      return false;
    }

    if (currentRoute.forced_battle && !this.game.hasFlag(currentRoute.forced_battle.flag)) {
      const trainerId = currentRoute.forced_battle.trainer_id;
      const trainer = this.game.factory.getDynamicTrainer(trainerId);
      if (!trainer) {
        console.warn(`[dev] forced_battle trainer "${trainerId}" is not in trainers.json yet.`);
      } else {
        this.printToLog(`Wait! ${trainer.name} steps out to challenge you!`);
        this.printToLog(`"${trainer.dialogueBefore || 'Let us battle!'}"`);

        this.game.gameState.activeTrainerPartyIndex = 0;
        this.game.gameState.activeTrainerId = trainerId;

        const enemyParty = this.game.factory.generateTrainerParty(trainer);

        this.game.battleManager.startTrainerBattle(enemyParty, trainer, currentRoute.forced_battle.flag);
        return false;
      }
    }

    if (currentRoute.gate_requirements && currentRoute.gate_requirements[targetRouteId]) {
      const gate = currentRoute.gate_requirements[targetRouteId];
      // blocked_flags: travel is refused while ANY of these flags is set
      // (e.g. the S.S. Anne after it departs). Checked before required_flags
      // so a departed ship reports itself as gone rather than ticket-locked.
      if (gate.blocked_flags && gate.blocked_flags.some(flag => this.game.hasFlag(flag))) {
        this.printToLog(gate.departed_message || gate.blocked_message);
        return false;
      }
      const satisfiesReqs = (gate.required_flags || []).every(flag => this.game.hasFlag(flag));

      if (!satisfiesReqs) {
        this.printToLog(gate.blocked_message);
        return false;
      }

      // confirm: ask the player to confirm every attempt (e.g. entering the
      // Elite Four from Indigo Plateau). Yes completes the travel, No stays.
      if (gate.confirm) {
        this.openChoiceMenu({
          prompt: gate.confirm.prompt,
          yes_label: gate.confirm.yes_label || "Yes",
          no_label: gate.confirm.no_label || "No",
          decline: gate.confirm.decline || "You step back.",
          onYes: () => this._finishTravel(targetRouteId, currentRoute, targetRoute),
        });
        return false;
      }
    }

    return this._finishTravel(targetRouteId, currentRoute, targetRoute);
  }

  // MOVED FROM APP.JS
  _finishTravel(targetRouteId, currentRoute, targetRoute) {
    // Leaving the Safari Zone ends the visit: leftover Safari Balls are
    // forfeited and the entry flag is cleared (re-entry costs the fee again).
    if (currentRoute && currentRoute.safari && !(targetRoute && targetRoute.safari)) {
      this.game.gameState.safariBattle = null;
      this.game.gameState.safariBalls = 0;
      this.game.setFlag('in_safari_zone', false);
    }

    this.game.gameState.currentRoute = targetRouteId;
    this.game.trackVisitedTown(targetRouteId); // Leave trackVisitedTown in app.js as a core logic state-tracker
    // Routes can set a flag on first arrival (e.g. Vermilion sets
    // reached_vermilion, which unhides Diglett's Cave on Route 2 North).
    if (targetRoute && targetRoute.on_enter_set_flag) {
      this.game.setFlag(targetRoute.on_enter_set_flag);
    }

    this.printToLog(`Arrived at ${targetRoute.name}.`);
    this.renderRouteScreen();
    this.setMenuState('route');
    return true;
  }
}

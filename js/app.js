import { BattleEngine } from './battle.js';
import { CaptureSystem } from './captures.js';
import { GrowthEngine } from './growth.js';
import { UIManager } from './ui.js';
import { StorageManager } from './storage.js';
import { PokemonFactory } from './pokemon_factory.js';
import { FacilityManager } from './facilities.js';

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
      activeTrainerPartyIndex: 0, // NEW: Tracks current trainer's pokemon
      pendingEnemyMonData: null   // NEW: Stores next enemy pokemon during switch prompt
    };

    this.partySwapIndex = null;
    this.captureSystem = new CaptureSystem(this);
    this.growth = new GrowthEngine(this);
    this.ui = new UIManager(this);
    this.storage = new StorageManager(this);
    this.factory = new PokemonFactory(this);
    this.facilities = new FacilityManager(this);
    
    this.db = {
      routes: {},
      pokemon: {},
      moves: {},
      trainers: {}
    };
  }

  async init() {
    const [routesRes, pokemonRes, movesRes, trainersRes, typesRes, itemsRes, shopsRes, gymsRes] = await Promise.all([
      fetch('./data/routes.json'),
      fetch('./data/pokemon.json'),
      fetch('./data/moves.json'),
      fetch('./data/trainers.json'),
      fetch('./data/type_chart.json'),
      fetch('./data/items.json'),
      fetch('./data/shops.json'),
      fetch('./data/gyms.json')
    ]);

    this.db.routes = await routesRes.json();
    this.db.pokemon = await pokemonRes.json();
    this.db.moves = await movesRes.json();
    this.db.trainers = await trainersRes.json();
    this.db.typeChart = await typesRes.json();
    this.db.items = await itemsRes.json();
    this.db.shops = await shopsRes.json();
    this.db.gyms = await gymsRes.json();
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

  pickStarter(speciesId) {
    const safeId = speciesId.toLowerCase();

    const advantageMap = {
      'bulbasaur': 'charmander',
      'charmander': 'squirtle',
      'squirtle': 'bulbasaur'
    };
    this.gameState.rivalStarter = advantageMap[safeId];
    
    const starter = this.factory.generatePokemonInstance(safeId, 5);
    
    this.gameState.party.push(starter);
    this.gameState.hasStarter = true;
    
    this.gameState.pokedex.seen[safeId] = true;
    this.gameState.pokedex.caught[safeId] = true;
    this.ui.updatePokedexTrackerUI();

    this.ui.printToLog(`You chose ${starter.species}! A fantastic choice.`);
    this.checkGameStart();
  }

  getDynamicTrainer(trainerId) {
    const trainerTemplate = this.db.trainers[trainerId];
    if (!trainerTemplate) return null;

    const trainer = JSON.parse(JSON.stringify(trainerTemplate));

    trainer.party.forEach(mon => {
      if (mon.species === "RIVAL_STARTER") {
        mon.species = this.gameState.rivalStarter;
      }

      if (mon.species === "RIVAL_STARTER_STAGE_2") {
        const stage2Map = {
          'bulbasaur': 'ivysaur',
          'charmander': 'charmeleon',
          'squirtle': 'wartortle'
        };
        mon.species = stage2Map[this.gameState.rivalStarter];
      }

      if (mon.species === "RIVAL_STARTER_STAGE_3") {
        const stage3Map = {
          'bulbasaur': 'venusaur',
          'charmander': 'charizard',
          'squirtle': 'blastoise'
        };
        mon.species = stage3Map[this.gameState.rivalStarter];
      }
    });

    return trainer;
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
      btn.onclick = () => {
        this.gameState.currentRoute = destinationId;
        this.ui.renderRouteScreen();
        this.ui.printToLog(`You traveled to ${destData.name}.`);
        this.ui.setMenuState('route');
      };
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

  startBattle(wildPokemonInfo) {
    const speciesKey = wildPokemonInfo.species.toLowerCase();
    this.gameState.pokedex.seen[speciesKey] = true;
    this.ui.updatePokedexTrackerUI();

    const enemyMon = this.factory.generatePokemonInstance(wildPokemonInfo.species, wildPokemonInfo.level);
    if (!enemyMon) {
      this.ui.printToLog("Error generating wild Pokémon stats!");
      return;
    }

    this.ui.printToLog(`A wild ${enemyMon.species} (Lv. ${enemyMon.level}) appeared!`);
    
    this.gameState.activeBattle = new BattleEngine(
      this.gameState.party[0], 
      enemyMon, 
      (msg) => {
        this.ui.printToLog(msg);
        this.ui.updatePartyUI();
      },
      (participants, defeatedEnemy) => { 
        this.handleEnemyDefeated(participants, defeatedEnemy);
      },
      () => {
        this.checkBlackout();
      },
      () => { 
        this.ui.printToLog("Choose a Pokémon to send out!");
        this.openPokemonMenu();
      },
      this.db.typeChart,
      this.gameState.party
    );

    this.refreshBattleMoveButtons();

    const battleBagBtn = document.getElementById('btn-battle-bag');
    if (battleBagBtn) battleBagBtn.onclick = () => this.openBag();

    this.ui.setMenuState('battle');
  }

startTrainerBattle(enemyMon, trainer, winFlag = null) {
    const speciesKey = enemyMon.species.toLowerCase();
    this.gameState.pokedex.seen[speciesKey] = true;
    this.ui.updatePokedexTrackerUI();

    if (!enemyMon) {
      this.ui.printToLog("Error generating trainer's Pokémon!");
      return;
    }

    this.ui.printToLog(`${trainer.name} sent out ${enemyMon.species} (Lv. ${enemyMon.level})!`);
    
    const enemyItems = (trainer.items || [])
      .map(itemId => {
        const itemObj = this.db.items[itemId];
        return itemObj ? { ...itemObj } : null;
      })
      .filter(item => item !== null);

    this.gameState.activeBattle = new BattleEngine(
      this.gameState.party[0], 
      enemyMon, 
      (msg) => {
        this.ui.printToLog(msg);
        this.ui.updatePartyUI();
      },
      (participants, defeatedEnemy) => { 
        this.handleEnemyDefeated(participants, defeatedEnemy);
      },
      () => {
        this.checkBlackout();
      },
      () => { 
        this.ui.printToLog("Choose a Pokémon to send out!");
        this.openPokemonMenu();
      },
      this.db.typeChart,
      this.gameState.party,
      trainer.name, 
      enemyItems  
    );

    this.refreshBattleMoveButtons();
    const battleBagBtn = document.getElementById('btn-battle-bag');
    if (battleBagBtn) battleBagBtn.onclick = () => this.openBag();

    this.gameState.activeTrainer = trainer;    
    this.gameState.activeWinFlag = winFlag;
    this.ui.setMenuState('battle');
  }

  handleEnemyDefeated(participants, defeatedEnemy) {
    this.growth.awardExp(participants, defeatedEnemy);
  }

  handleTurn(playerMove) {
    if (!this.gameState.activeBattle) return;
    if (playerMove.pp !== undefined && playerMove.pp > 0) {
      playerMove.pp--;
    }
    this.gameState.activeBattle.executeTurn(playerMove);
    if (this.gameState.activeBattle && this.gameState.activeBattle.isOver) {
      this.handleBattleEnd();
    }
  }

  // UPDATED: Now checks trainer party length to handle multi-battles
  handleBattleEnd() {
    if (this.checkBlackout()) return; 

    if (this.gameState.activeBattle && this.gameState.activeBattle.enemyMon.hp <= 0 && this.gameState.activeTrainer) {
      this.gameState.activeTrainerPartyIndex++;
      const trainer = this.gameState.activeTrainer;

      // Check if the trainer has more Pokémon left!
      if (this.gameState.activeTrainerPartyIndex < trainer.party.length) {
        const nextMonData = trainer.party[this.gameState.activeTrainerPartyIndex];
        this.promptTrainerSwitch(nextMonData, trainer);
        return; // Halt the end-battle logic here to wait for player
      }

      // If no more pokemon, standard trainer defeat logic
      const payout = trainer.payout || 500;
      this.gameState.money += payout;
      this.ui.printToLog(`You defeated ${trainer.name} and got ¥${payout}!`);
      
      if (this.gameState.activeWinFlag) {
        this.setFlag(this.gameState.activeWinFlag, true);
        this.ui.printToLog(`You obtained the ${this.gameState.activeWinFlag.replace('_', ' ')}!`);
      }

      this.ui.updateMoneyUI();
    }
    
    // Clear out battle state
    this.gameState.activeTrainer = null;
    this.gameState.activeBattle = null;
    this.gameState.activeWinFlag = null; 
    this.gameState.activeTrainerPartyIndex = 0; 

    setTimeout(() => {
      this.ui.printToLog("Returning to the route...");
      this.ui.setMenuState('route');
    }, 2000);
  }

  checkBlackout() {
      const isWiped = this.gameState.party.every(p => p.hp <= 0);
      if (isWiped) {
        this.ui.printToLog("You hurried away to protect your Pokemon from further harm.");
        this.gameState.money = Math.floor(this.gameState.money / 2);
        this.gameState.currentRoute = this.gameState.lastHealedLocation || "pallet_town";
        
        this.gameState.party.forEach(p => {
          p.hp = p.maxHp; // Heal HP
          if (p.moves) {
            p.moves.forEach(m => {
              if (m.maxPp !== undefined) m.pp = m.maxPp;
            });
          }
        });
        
        this.ui.updateMoneyUI();
        this.ui.updatePartyUI();
  
        this.gameState.activeTrainer = null;
        this.gameState.activeBattle = null;
        
        setTimeout(() => {
          this.ui.renderRouteScreen();
          this.ui.setMenuState('route');
        }, 500);
        return true;
      }
      return false;
    }

  setFlag(flagName, value = true) {
    this.gameState.flags[flagName] = value;
  }

  hasFlag(flagName) {
    return !!this.gameState.flags[flagName];
  }
  
  bindListeners() {
    document.getElementById('btn-starter-bulbasaur')?.addEventListener('click', () => this.pickStarter('bulbasaur'));
    document.getElementById('btn-starter-charmander')?.addEventListener('click', () => this.pickStarter('charmander'));
    document.getElementById('btn-starter-squirtle')?.addEventListener('click', () => this.pickStarter('squirtle'));
    
    document.getElementById('btn-encounter')?.addEventListener('click', () => {
      const result = this.triggerEncounter();
      if (typeof result === 'string') this.ui.printToLog(result);
      else this.startBattle(result);
    });

    document.getElementById('btn-explore')?.addEventListener('click', () => {
      const result = this.triggerExplore();
      if (typeof result === 'string') this.ui.printToLog(result);
      else if (result && result.species) {
        this.ui.printToLog(`You were ambushed!`);
        this.startBattle(result);
      }
    });

    document.getElementById('btn-pokemon')?.addEventListener('click', () => this.openPokemonMenu());
    document.getElementById('btn-party')?.addEventListener('click', () => this.openPokemonMenu());
    document.getElementById('btn-pokedex')?.addEventListener('click', () => this.openPokedex());
    
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

      const trainer = this.getDynamicTrainer(undefeatedTrainerId);
      if (!trainer) {
        this.ui.printToLog("Error: Trainer data not found!");
        return;
      }

      this.ui.printToLog(`${trainer.name} wants to battle!`);
      this.ui.printToLog(`"${trainer.dialogueBefore}"`);

      const enemyMonData = trainer.party[0];
      const enemyMon = this.factory.generatePokemonInstance(enemyMonData.species, enemyMonData.level);

      this.gameState.defeatedTrainers[undefeatedTrainerId] = true; 
      this.gameState.activeTrainerPartyIndex = 0; // NEW: reset index to 0 at the start of a battle!
      this.startTrainerBattle(enemyMon, trainer);
    });

    document.getElementById('btn-travel')?.addEventListener('click', () => this.ui.setMenuState('travel'));
    document.getElementById('btn-menu')?.addEventListener('click', () => this.ui.setMenuState('system'));
    document.getElementById('btn-back-menu')?.addEventListener('click', () => this.ui.setMenuState('route'));
    document.getElementById('btn-back-travel')?.addEventListener('click', () => this.ui.setMenuState('route'));
    document.getElementById('btn-save')?.addEventListener('click', () => this.handleSaveLoad());
    document.getElementById('btn-bag')?.addEventListener('click', () => this.openBag());
    
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
        btn.onclick = () => this.handleItemClick(itemKey);
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

  openPokemonMenu() {
    this.ui.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    if (this.gameState.party.length === 0) {
      content.innerHTML = '<p style="text-align:center;">You have no Pokémon in your party.</p>';
    } else {
      this.gameState.party.forEach((mon, index) => {
        const pbox = document.createElement('div');
        pbox.style.border = this.partySwapIndex === index ? "2px solid red" : "1px solid #ccc";
        pbox.style.padding = "8px";
        pbox.style.marginBottom = "8px";
        pbox.style.cursor = "pointer";
        
        pbox.innerHTML = `
          <strong>${mon.species} (Lv. ${mon.level})</strong> - ${mon.types.join('/')}<br>
          HP: ${mon.hp}/${mon.maxHp} | EXP: ${mon.exp}/${mon.maxExp}<br>
          Atk: ${mon.stats.attack} | Def: ${mon.stats.defense} | SpA: ${mon.stats.spAtk} | SpD: ${mon.stats.spDef} | Spd: ${mon.speed}<br>
          Moves: ${mon.moves.map(m => m.name).join(', ')}
        `;
        
        pbox.onclick = () => {
          if (this.partySwapIndex !== null) {
            if (this.partySwapIndex !== index) {
              const temp = this.gameState.party[this.partySwapIndex];
              this.gameState.party[this.partySwapIndex] = this.gameState.party[index];
              this.gameState.party[index] = temp;
              this.ui.printToLog(`Swapped ${this.gameState.party[index].species} and ${this.gameState.party[this.partySwapIndex].species}.`);
            }
            this.partySwapIndex = null;
            this.ui.updatePartyUI();
            this.openPokemonMenu();
          } else {
            this.partySwapIndex = index;
            this.openPokemonMenu();
          }
        };
        content.appendChild(pbox);
      });
    }

    this.ui.buildMenuControls(controls, [
      { text: this.partySwapIndex !== null ? "Cancel Swap" : "Close", action: () => {
          if (this.partySwapIndex !== null) {
            this.partySwapIndex = null;
            this.openPokemonMenu();
          } else {
            this.ui.setMenuState('system');
          }
      }}
    ]);
  }
  
  handleItemClick(itemKey) {
    const item = this.db.items[itemKey]; 
    
    if (item.category === "catch") { 
      if (this.gameState.activeBattle) {
        this.captureSystem.attemptCatch(itemKey);
      } else {
        this.ui.printToLog("Oak's words echoed: There's a time and place for everything, but not now.");
      }
    } 
    else if (item.category === "healing") { 
      this.openPartyTargetScreen(itemKey, item);
    }
  }

  applyItemToPokemon(itemKey, itemData, partyIndex) {
    const target = this.gameState.party[partyIndex];

    if (itemData.effect.type === "heal") { 
      if (target.hp >= target.maxHp) {
        this.ui.printToLog("It won't have any effect.");
        return; 
      }
      
      target.hp = Math.min(target.maxHp, target.hp + itemData.effect.value); 
      this.ui.printToLog(`You used a ${itemData.name}! ${target.species} recovered health.`);
    }

    this.gameState.inventory[itemKey]--;
    if (this.gameState.inventory[itemKey] <= 0) delete this.gameState.inventory[itemKey];
    this.ui.updatePartyUI();

    if (this.gameState.activeBattle) {
      this.ui.setMenuState('battle');
      const enemyMove = this.gameState.activeBattle.getRandomEnemyMove();
      this.gameState.activeBattle.processAction(this.gameState.activeBattle.enemyMon, this.gameState.party[0], enemyMove, false);
      this.gameState.activeBattle.checkWinLoss();

      if (this.gameState.activeBattle.isOver) {
        this.handleBattleEnd();
      }
    } else {
      this.ui.setMenuState('system'); 
    }
  }

  openPokedex() {
    this.ui.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    const seenKeys = Object.keys(this.gameState.pokedex.seen);

    if (seenKeys.length === 0) {
      const p = document.createElement('p');
      p.textContent = "No Pokémon seen yet!";
      p.style.textAlign = "center";
      content.appendChild(p);
    } else {
      const entries = seenKeys.map(key => {
        const pokemonData = this.db.pokemon[key];
        return {
          id: key,
          pokedexNumber: pokemonData ? pokemonData.pokedexNumber : 999,
          name: pokemonData ? pokemonData.name : key.toUpperCase()
        };
      });

      entries.sort((a, b) => a.pokedexNumber - b.pokedexNumber);

      entries.forEach(entry => {
        const p = document.createElement('p');
        const isCaught = this.gameState.pokedex.caught[entry.id];
        const numStr = String(entry.pokedexNumber).padStart(3, '0');
        p.textContent = `#${numStr} ${isCaught ? '🔴' : '⚫'} ${entry.name}`;
        content.appendChild(p);
      });
    }

    this.ui.buildMenuControls(controls, [
      { text: "Close", action: () => this.ui.setMenuState('system') }
    ]);
  }

    refreshBattleMoveButtons() {
        const activeMon = this.gameState.party[0];
        const leadMoves = activeMon.moves;
        
        for (let i = 0; i < 4; i++) {
          const btn = document.getElementById(`btn-move-${i}`);
          const move = leadMoves[i];
    
          if (btn && move) {
            if (move.maxPp !== undefined) {
              btn.textContent = `${move.name} (${move.pp}/${move.maxPp})`;
            } else {
              btn.textContent = move.name;
            }
    
            if (move.pp !== undefined && move.pp <= 0) {
              btn.disabled = true;
              btn.style.opacity = "0.5";
              btn.onclick = null;
            } else {
              btn.disabled = false;
              btn.style.opacity = "1";
              btn.onclick = () => this.handleTurn(move);
            }
            btn.style.display = "block";
          } else if (btn) {
            btn.style.display = "none";
          }
        }
      }

  travelTo(targetRouteId) {
    const currentRoute = this.db.routes[this.gameState.currentRoute];
    const targetRoute = this.db.routes[targetRouteId];

    if (currentRoute.gate_requirements?.[targetRouteId]) {
      const gate = currentRoute.gate_requirements[targetRouteId];
      const satisfiesReqs = gate.required_flags.every(flag => this.gameState.flags[flag]);
      
      if (!satisfiesReqs) {
        this.ui.printToLog(gate.blocked_message);
        return false;
      }
    }

    this.gameState.currentRoute = targetRouteId;
    this.ui.printToLog(`Arrived at ${targetRoute.name}.`);

    if (targetRoute.forced_battle && !this.gameState.flags[targetRoute.forced_battle.flag]) {
      const trainer = this.getDynamicTrainer(targetRoute.forced_battle.trainer_id);
      this.ui.printToLog(`${trainer.name} steps out to challenge you!`);
      this.gameState.activeTrainerPartyIndex = 0; // NEW: Reset index on forced travel battle too!
      this.startTrainerBattle(trainer.party[0], trainer, targetRoute.forced_battle.flag);
      return true;
    }

    this.ui.setMenuState('route');
    return true;
  }
  
  openPartyTargetScreen(itemKey, itemData) {
    this.ui.setMenuState('party-select');
    const container = document.getElementById('party-select-list');
    container.innerHTML = '';

    this.gameState.party.forEach((mon, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.innerText = `${mon.species} (HP: ${mon.hp}/${mon.maxHp})`;
      
      btn.onclick = () => this.applyItemToPokemon(itemKey, itemData, index);
      container.appendChild(btn);
    });
  }

  // ==========================================
  // NEW: TRAINER MULTI-POKEMON & SWITCH LOGIC
  // ==========================================

  promptTrainerSwitch(nextMonData, trainer) {
    this.ui.printToLog(`${trainer.name} is about to send out ${nextMonData.species}.`);
    this.ui.printToLog(`Will you switch your Pokémon?`);

    this.gameState.pendingEnemyMonData = nextMonData; // Save it for after they answer

    // Repurpose the dynamic menu for the Yes/No dialogue!
    this.ui.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    
    content.innerHTML = '<p style="text-align:center; font-weight:bold;">Change Pokémon?</p>';
    controls.innerHTML = '';

    this.ui.buildMenuControls(controls, [
      { text: "Yes", action: () => this.openTrainerSwitchMenu() },
      { text: "No", action: () => this.sendNextTrainerPokemon() }
    ]);
  }

  openTrainerSwitchMenu() {
    this.ui.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    this.gameState.party.forEach((mon, index) => {
      const pbox = document.createElement('div');
      pbox.style.border = "1px solid #ccc";
      pbox.style.padding = "8px";
      pbox.style.marginBottom = "8px";
      pbox.style.cursor = mon.hp > 0 ? "pointer" : "not-allowed";
      pbox.style.opacity = mon.hp > 0 ? "1" : "0.5";

      pbox.innerHTML = `
        <strong>${mon.species} (Lv. ${mon.level})</strong> - ${mon.types.join('/')}<br>
        HP: ${mon.hp}/${mon.maxHp} | EXP: ${mon.exp}/${mon.maxExp}<br>
        Moves: ${mon.moves.map(m => m.name).join(', ')}
      `;

      pbox.onclick = () => {
        if (mon.hp > 0) {
          if (index !== 0) { // Swap them to the front if they aren't already
            const temp = this.gameState.party[0];
            this.gameState.party[0] = this.gameState.party[index];
            this.gameState.party[index] = temp;
            this.ui.printToLog(`You sent out ${this.gameState.party[0].species}!`);
          }
          this.sendNextTrainerPokemon();
        }
      };
      content.appendChild(pbox);
    });

    this.ui.buildMenuControls(controls, [
      { text: "Cancel (Keep Current)", action: () => this.sendNextTrainerPokemon() }
    ]);
  }

  sendNextTrainerPokemon() {
    const nextMonData = this.gameState.pendingEnemyMonData;
    this.gameState.pendingEnemyMonData = null; // Clear the memory

    const enemyMon = this.factory.generatePokemonInstance(nextMonData.species, nextMonData.level);
    if (!enemyMon) return;

    // Update the Pokedex just like startTrainerBattle does
    const speciesKey = enemyMon.species.toLowerCase();
    this.gameState.pokedex.seen[speciesKey] = true;
    this.ui.updatePokedexTrackerUI();

    this.ui.printToLog(`${this.gameState.activeTrainer.name} sent out ${enemyMon.species} (Lv. ${enemyMon.level})!`);

    // Spin up a fresh BattleEngine sequence for the next match up
    this.gameState.activeBattle = new BattleEngine(
      this.gameState.party[0], 
      enemyMon, 
      (msg) => {
        this.ui.printToLog(msg);
        this.ui.updatePartyUI();
      },
      (participants, defeatedEnemy) => { 
        this.handleEnemyDefeated(participants, defeatedEnemy);
      },
      () => {
        this.checkBlackout();
      },
      () => { 
        this.ui.printToLog("Choose a Pokémon to send out!");
        this.openPokemonMenu();
      },
      this.db.typeChart,
      this.gameState.party
    );

    this.refreshBattleMoveButtons();
    this.ui.setMenuState('battle');
  }
}

const game = new GameEngine();
game.init();

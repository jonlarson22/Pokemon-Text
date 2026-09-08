import { BattleEngine } from './battle.js';
import { CaptureSystem } from './captures.js';
import { GrowthEngine } from './growth.js';
import { UIManager } from './ui.js';
import { StorageManager } from './storage.js';

class GameEngine {
  constructor() {
    this.gameState = {
      currentRoute: "pallet_town",
      hasStarter: false,
      flags: {},
      defeatedTrainers: {},
      party: [],
      money: 3000,
      inventory: { "potion": 1 },
      pc: { pokemon: [], items: {} },
      pokedex: { seen: {}, caught: {} },
      activeBattle: null,
      activeTrainer: null,
      lastHealedLocation: null
    };

    this.partySwapIndex = null;
    this.captureSystem = new CaptureSystem(this);
    this.growth = new GrowthEngine(this);
    this.ui = new UIManager(this);
    this.storage = new StorageManager(this);
    
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
    if (!this.gameState.hasStarter || this.gameState.party.length === 0) {
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

  generatePokemonInstance(speciesId, level) {
    const safeId = speciesId.toLowerCase(); 
    const baseData = this.db.pokemon[safeId];
    
    if (!baseData) {
      console.error(`Missing data for species: ${speciesId}`);
      return null;
    }

    const ivs = {
      hp: Math.floor(Math.random() * 32),
      attack: Math.floor(Math.random() * 32),
      defense: Math.floor(Math.random() * 32),
      spAtk: Math.floor(Math.random() * 32),
      spDef: Math.floor(Math.random() * 32),
      speed: Math.floor(Math.random() * 32)
    };

    const calcStat = (base, iv, lvl, isHP) => {
      if (isHP) return Math.floor(((2 * base + iv) * lvl) / 100) + lvl + 10;
      return Math.floor(((2 * base + iv) * lvl) / 100) + 5;
    };

    const hp = calcStat(baseData.baseStats.hp, ivs.hp, level, true);
    
    return {
      species: baseData.name,
      id: safeId,
      types: baseData.types,
      level: level,
      hp: hp,
      maxHp: hp,
      ivs: ivs,
      speed: calcStat(baseData.baseStats.speed, ivs.speed, level, false),
      stats: {
        attack: calcStat(baseData.baseStats.attack, ivs.attack, level, false),
        defense: calcStat(baseData.baseStats.defense, ivs.defense, level, false),
        spAtk: calcStat(baseData.baseStats.spAtk, ivs.spAtk, level, false),
        spDef: calcStat(baseData.baseStats.spDef, ivs.spDef, level, false),
      },
      moves: baseData.moves.slice(0, 4).map(moveId => this.db.moves[moveId]).filter(Boolean),
      exp: 0,
      maxExp: level * 100
    };
  }

  pickStarter(speciesId) {
    const safeId = speciesId.toLowerCase();
    const starter = this.generatePokemonInstance(safeId, 5);
    
    this.gameState.party.push(starter);
    this.gameState.hasStarter = true;
    
    this.gameState.pokedex.seen[safeId] = true;
    this.gameState.pokedex.caught[safeId] = true;
    this.ui.updatePokedexTrackerUI();

    this.ui.printToLog(`You chose ${starter.species}! A fantastic choice.`);
    this.checkGameStart();
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

    const enemyMon = this.generatePokemonInstance(wildPokemonInfo.species, wildPokemonInfo.level);
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
      (defeatedEnemy) => {
        this.growth.awardExp(this.gameState.party[0], defeatedEnemy);
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
    if (battleBagBtn) battleBagBtn.onclick = () => this.openBag();

    this.ui.setMenuState('battle');
  }

  startTrainerBattle(enemyMon, trainer) {
    const speciesKey = enemyMon.species.toLowerCase();
    this.gameState.pokedex.seen[speciesKey] = true;
    this.ui.updatePokedexTrackerUI();

    if (!enemyMon) {
      this.ui.printToLog("Error generating trainer's Pokémon!");
      return;
    }

    this.ui.printToLog(`${trainer.name} sent out ${enemyMon.species} (Lv. ${enemyMon.level})!`);
    
    this.gameState.activeBattle = new BattleEngine(
      this.gameState.party[0], 
      enemyMon, 
      (msg) => {
        this.ui.printToLog(msg);
        this.ui.updatePartyUI();
      },
      (defeatedEnemy) => {
        this.growth.awardExp(this.gameState.party[0], defeatedEnemy);
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
    if (battleBagBtn) battleBagBtn.onclick = () => this.openBag();

    this.gameState.activeTrainer = trainer;    
    this.ui.setMenuState('battle');
  }

  handleTurn(playerMove) {
    this.gameState.activeBattle.executeTurn(playerMove);
    if (this.gameState.activeBattle.isOver) this.handleBattleEnd();
  }

  handleBattleEnd() {
    if (this.checkBlackout()) return; 

    if (this.gameState.activeBattle && this.gameState.activeBattle.enemyMon.hp <= 0 && this.gameState.activeTrainer) {
      const payout = this.gameState.activeTrainer.payout || 500;
      this.gameState.money += payout;
      this.ui.printToLog(`You defeated ${this.gameState.activeTrainer.name} and got ¥${payout}!`);
      this.ui.updateMoneyUI();
    }
    
    this.gameState.activeTrainer = null;
    this.gameState.activeBattle = null;

    setTimeout(() => {
      this.ui.printToLog("Returning to the route...");
      this.ui.setMenuState('route');
    }, 2000);
  }

  checkBlackout() {
    const isWiped = this.gameState.party.every(p => p.hp <= 0);
    if (isWiped) {
      this.ui.printToLog("You have no more usable Pokémon! You whited out! You hurried away to protect your Pokemon from further harm.");
      this.gameState.money = Math.floor(this.gameState.money / 2);
      this.gameState.currentRoute = this.gameState.lastHealedLocation || "pallet_town";
      
      this.gameState.party.forEach(p => p.hp = p.maxHp);
      this.ui.updateMoneyUI();

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

      const trainer = this.db.trainers[undefeatedTrainerId];
      if (!trainer) {
        this.ui.printToLog("Error: Trainer data not found!");
        return;
      }

      this.ui.printToLog(`${trainer.name} wants to battle!`);
      this.ui.printToLog(`"${trainer.dialogueBefore}"`);

      const enemyMonData = trainer.party[0];
      const enemyMon = this.generatePokemonInstance(enemyMonData.species, enemyMonData.level);

      this.gameState.defeatedTrainers[undefeatedTrainerId] = true; 
      this.startTrainerBattle(enemyMon, trainer);
    });

    document.getElementById('btn-travel')?.addEventListener('click', () => this.ui.setMenuState('travel'));
    document.getElementById('btn-menu')?.addEventListener('click', () => this.ui.setMenuState('system'));
    document.getElementById('btn-back-menu')?.addEventListener('click', () => this.ui.setMenuState('route'));
    document.getElementById('btn-back-travel')?.addEventListener('click', () => this.ui.setMenuState('route'));
    document.getElementById('btn-save')?.addEventListener('click', () => this.handleSaveLoad());
    document.getElementById('btn-bag')?.addEventListener('click', () => this.openBag());
    
    document.getElementById('btn-run')?.addEventListener('click', () => {
      this.ui.printToLog("Got away safely!");
      this.ui.setMenuState('route');
    });

    document.getElementById('btn-load-game')?.addEventListener('click', () => this.storage.loadLocal());
        document.getElementById('btn-import-save')?.addEventListener('click', () => {
      document.getElementById('input-import-file').click();
    });
        document.getElementById('input-import-file')?.addEventListener('change', (e) => this.storage.handleImport(e));

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

  openCenter() {
    this.ui.setMenuState('dynamic');
    this.ui.printToLog("Welcome to the Pokémon Center!");
    this.renderCenterMenu();
  }

  renderCenterMenu() {
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    this.ui.buildMenuControls(controls, [
      { text: "Heal Party", action: () => {
          this.gameState.party.forEach(p => p.hp = p.maxHp);
          this.gameState.lastHealedLocation = this.gameState.currentRoute; 
          this.ui.updatePartyUI();
          this.ui.printToLog("Your Pokémon are fully healed!");
      }},
      { text: "PC: Deposit", action: () => this.renderPCDeposit() },
      { text: "PC: Withdraw", action: () => this.renderPCWithdraw() },
      { text: "Exit", action: () => { this.ui.printToLog("We hope to see you again!"); this.ui.setMenuState('route'); } }
    ]);
  }

  renderPCDeposit() {
    const content = document.getElementById('dynamic-content');
    content.innerHTML = '';
    this.ui.printToLog("Select a Pokémon to deposit.");

    this.gameState.party.forEach((mon, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Deposit ${mon.species} (Lv. ${mon.level})`;
      btn.onclick = () => {
        if (this.gameState.party.length <= 1) {
          this.ui.printToLog("You can't deposit your last Pokémon!");
          return;
        }
        const deposited = this.gameState.party.splice(index, 1)[0];
        this.gameState.pc.pokemon.push(deposited);
        this.ui.updatePartyUI();
        this.ui.printToLog(`Deposited ${deposited.species} in the PC.`);
        this.renderPCDeposit();
      };
      content.appendChild(btn);
    });
  }

  renderPCWithdraw() {
    const content = document.getElementById('dynamic-content');
    content.innerHTML = '';
    
    if (this.gameState.pc.pokemon.length === 0) {
      this.ui.printToLog("Your PC Box is empty.");
      return;
    }

    this.ui.printToLog("Select a Pokémon to withdraw.");

    this.gameState.pc.pokemon.forEach((mon, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Withdraw ${mon.species} (Lv. ${mon.level})`;
      btn.onclick = () => {
        if (this.gameState.party.length >= 6) {
          this.ui.printToLog("Your party is full!");
          return;
        }
        const withdrawn = this.gameState.pc.pokemon.splice(index, 1)[0];
        this.gameState.party.push(withdrawn);
        this.ui.updatePartyUI();
        this.ui.printToLog(`Withdrew ${withdrawn.species} from the PC.`);
        this.renderPCWithdraw();
      };
      content.appendChild(btn);
    });
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
  
  openShop() {
    this.ui.setMenuState('dynamic');
    this.renderBuyMenu();
  }

  renderBuyMenu() {
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    const shopItemKeys = this.db.shops[this.gameState.currentRoute];

    if (!shopItemKeys) {
      this.ui.printToLog("This shop is currently closed.");
      setTimeout(() => this.ui.setMenuState('route'), 1500);
      return;
    }

    this.ui.printToLog("Welcome to the Poké Mart! What would you like to buy?");

    shopItemKeys.forEach(itemKey => {
      const itemData = this.db.items[itemKey];
      if (!itemData) return;

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `${itemData.name} - ¥${itemData.price}`;
      btn.onclick = () => {
        if (this.gameState.money >= itemData.price) {
          this.gameState.money -= itemData.price;
          this.gameState.inventory[itemKey] = (this.gameState.inventory[itemKey] || 0) + 1;
          this.ui.updateMoneyUI();
          this.ui.printToLog(`You bought a ${itemData.name}!`);
        } else {
          this.ui.printToLog(`You don't have enough money for a ${itemData.name}.`);
        }
      };
      content.appendChild(btn);
    });

    this.ui.buildMenuControls(controls, [
      { text: "Buy", action: () => this.renderBuyMenu() },
      { text: "Sell", action: () => this.renderSellMenu() },
      { text: "Exit", action: () => { this.ui.printToLog("Come again!"); this.ui.setMenuState('route'); } }
    ]);
  }

  renderSellMenu() {
    const content = document.getElementById('dynamic-content');
    content.innerHTML = '';
    this.ui.printToLog("What would you like to sell?");

    const inventoryEntries = Object.entries(this.gameState.inventory).filter(([_, count]) => count > 0);

    if (inventoryEntries.length === 0) {
      const p = document.createElement('p');
      p.textContent = "Your bag is empty.";
      p.style.textAlign = "center";
      content.appendChild(p);
      return;
    }

    inventoryEntries.forEach(([itemKey, count]) => {
      const itemData = this.db.items[itemKey];
      const basePrice = itemData ? itemData.price : 100;
      const sellPrice = Math.floor(basePrice / 2);

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Sell ${itemData ? itemData.name : itemKey} (x${count}) - ¥${sellPrice}`;
      btn.onclick = () => {
        this.gameState.inventory[itemKey]--;
        if (this.gameState.inventory[itemKey] <= 0) delete this.gameState.inventory[itemKey];
        this.gameState.money += sellPrice;
        this.ui.updateMoneyUI();
        this.ui.printToLog(`You sold a ${itemData ? itemData.name : itemKey} for ¥${sellPrice}!`);
        this.renderSellMenu();
      };
      content.appendChild(btn);
    });
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
        p.textContent = `#${numStr} ${isCaught ? '🔴' : '⚪'} ${entry.name}`;
        content.appendChild(p);
      });
    }

    this.ui.buildMenuControls(controls, [
      { text: "Close", action: () => this.ui.setMenuState('system') }
    ]);
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
}

const game = new GameEngine();
game.init();

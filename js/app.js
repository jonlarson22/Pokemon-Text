// js/app.js - Complete Route, Encounter, and Battle Manager
import { BattleEngine } from './battle.js';
import { CaptureSystem } from './captures.js';

class GameEngine {
  constructor() {
    this.gameState = {
      currentRoute: "route1",
      flags: {},
      defeatedTrainers: {},
      party: [],
      money: 3000,
      inventory: { "potion": 1 },
      pc: { pokemon: [], items: {} },
      pokedex: { seen: {}, caught: {} },
      activeBattle: null
    };

    this.captureSystem = new CaptureSystem(this);
    
    this.db = {
      routes: {},
      pokemon: {},
      moves: {},
      trainers: {}
    };
  }

  async init() {
    const [routesRes, pokemonRes, movesRes, trainersRes, typesRes, itemsRes, shopsRes] = await Promise.all([
      fetch('./data/routes.json'),
      fetch('./data/pokemon.json'),
      fetch('./data/moves.json'),
      fetch('./data/trainers.json'),
      fetch('./data/type_chart.json'),
      fetch('./data/items.json'),
      fetch('./data/shops.json')
    ]);

    this.db.routes = await routesRes.json();
    this.db.pokemon = await pokemonRes.json();
    this.db.moves = await movesRes.json();
    this.db.trainers = await trainersRes.json();
    this.db.typeChart = await typesRes.json();
    this.db.items = await itemsRes.json();
    this.db.shops = await shopsRes.json();
    
    this.gameState.party.push(this.generatePokemonInstance("charmander", 5));

    this.renderRouteScreen();
    this.updatePartyUI();
    this.printToLog("Welcome to the Kanto region!");

    this.bindListeners();
  }

  checkGameStart() {
    // Check if they already have a Pokémon
    if (!this.gameState.hasStarter || this.gameState.party.length === 0) {
      this.printToLog("Welcome to the world of Pokémon! Please choose your first partner.");
      this.setMenuState('starter');
    } else {
      this.setMenuState('route');
    }
  }

  pickStarter(speciesId) {
    const speciesData = this.db.pokemon[speciesId];
    
    // Generate a fresh Level 5 Pokémon
    const starter = {
      species: speciesData.name,
      id: speciesData.id,
      level: 5,
      hp: speciesData.baseStats.hp, // Simplified for now; normally calculated with IVs/EVs
      maxHp: speciesData.baseStats.hp,
      types: speciesData.types,
      moves: [...speciesData.moves].slice(0, 4), // Give them up to 4 starting moves
      exp: 0,
      maxExp: 500
    };

    this.gameState.party.push(starter);
    this.gameState.hasStarter = true;
    
    this.printToLog(`You chose ${starter.species}! A fantastic choice.`);
    this.updatePartyUI();
    this.setMenuState('route');
  }
  
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

  updateMoneyUI() {
    const moneyEl = document.getElementById('money-count');
    if (moneyEl) {
      moneyEl.textContent = `Money: ¥${this.gameState.money}`;
    }
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

    const centerBtn = document.getElementById('btn-pokemon-center');
    const shopBtn = document.getElementById('btn-shop');

    if (centerBtn) {
      centerBtn.style.display = route.hasCenter ? "block" : "none";
      centerBtn.onclick = () => {
        this.openCenter();
      };
    }

    if (shopBtn) {
      shopBtn.style.display = route.hasShop ? "block" : "none";
      shopBtn.onclick = () => {
        this.openShop();
      };
    }
  } // <--- Added closing brace here

  setMenuState(menuName) {
    document.getElementById('route-actions').style.display = 'none';
    document.getElementById('system-menu').style.display = 'none';
    document.getElementById('travel-menu').style.display = 'none';
    document.getElementById('battle-actions').style.display = 'none';
    document.getElementById('dynamic-menu').style.display = 'none';

    if (menuName === 'route') {
      document.getElementById('route-actions').style.display = 'grid';
    } else if (menuName === 'system') {
      document.getElementById('system-menu').style.display = 'grid';
    } else if (menuName === 'travel') {
      document.getElementById('travel-menu').style.display = 'flex';
      this.populateTravelMenu();
    } else if (menuName === 'battle') {
      document.getElementById('battle-actions').style.display = 'grid';
    } else if (menuName === 'dynamic') {
      document.getElementById('dynamic-menu').style.display = 'flex';
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

    this.gameState.activeTrainer = trainer;    
    this.setMenuState('battle');
  }

  handleTurn(playerMove) {
    this.gameState.activeBattle.executeTurn(playerMove);
    
    if (this.gameState.activeBattle.isOver) {

      if (this.gameState.activeBattle.enemyMon.hp <= 0 && this.gameState.activeTrainer) {
        const payout = this.gameState.activeTrainer.payout || 500;
        this.gameState.money += payout;
        this.printToLog(`You defeated ${this.gameState.activeTrainer.name} and got ¥${payout}!`);
        
        const moneyEl = document.getElementById('money-count');
        if (moneyEl) moneyEl.textContent = `Money: ¥${this.gameState.money}`;
      }
      
      this.gameState.activeTrainer = null;

      setTimeout(() => {
        this.printToLog("Returning to the route...");
        this.setMenuState('route');
      }, 2000);
    }
  }

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

      const undefeatedTrainerId = route.trainers.find(id => !this.gameState.defeatedTrainers[id]);

      if (!undefeatedTrainerId) {
        this.printToLog("You have already defeated all trainers on this route!");
        return;
      }

      const trainer = this.db.trainers[undefeatedTrainerId];
      if (!trainer) {
        this.printToLog("Error: Trainer data not found!");
        return;
      }

      this.printToLog(`${trainer.name} wants to battle!`);
      this.printToLog(`"${trainer.dialogueBefore}"`);

      const enemyMonData = trainer.party[0];
      const enemyMon = this.generatePokemonInstance(enemyMonData.species, enemyMonData.level);

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

  openCenter() {
    this.setMenuState('dynamic');
    this.printToLog("Welcome to the Pokémon Center!");
    this.renderCenterMenu();
  }

  renderCenterMenu() {
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    this.buildMenuControls(controls, [
      { text: "Heal Party", action: () => {
          this.gameState.party.forEach(p => p.hp = p.maxHp);
          this.updatePartyUI();
          this.printToLog("Your Pokémon are fully healed!");
      }},
      { text: "PC: Deposit", action: () => this.renderPCDeposit() },
      { text: "PC: Withdraw", action: () => this.renderPCWithdraw() },
      { text: "Exit", action: () => { this.printToLog("We hope to see you again!"); this.setMenuState('route'); } }
    ]);
  }

  renderPCDeposit() {
    const content = document.getElementById('dynamic-content');
    content.innerHTML = '';
    this.printToLog("Select a Pokémon to deposit.");

    this.gameState.party.forEach((mon, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Deposit ${mon.species} (Lv. ${mon.level})`;
      btn.onclick = () => {
        if (this.gameState.party.length <= 1) {
          this.printToLog("You can't deposit your last Pokémon!");
          return;
        }
        const deposited = this.gameState.party.splice(index, 1)[0];
        this.gameState.pc.pokemon.push(deposited);
        this.updatePartyUI();
        this.printToLog(`Deposited ${deposited.species} in the PC.`);
        this.renderPCDeposit();
      };
      content.appendChild(btn);
    });
  }

  renderPCWithdraw() {
    const content = document.getElementById('dynamic-content');
    content.innerHTML = '';
    
    if (this.gameState.pc.pokemon.length === 0) {
      this.printToLog("Your PC Box is empty.");
      return;
    }

    this.printToLog("Select a Pokémon to withdraw.");

    this.gameState.pc.pokemon.forEach((mon, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Withdraw ${mon.species} (Lv. ${mon.level})`;
      btn.onclick = () => {
        if (this.gameState.party.length >= 6) {
          this.printToLog("Your party is full!");
          return;
        }
        const withdrawn = this.gameState.pc.pokemon.splice(index, 1)[0];
        this.gameState.party.push(withdrawn);
        this.updatePartyUI();
        this.printToLog(`Withdrew ${withdrawn.species} from the PC.`);
        this.renderPCWithdraw();
      };
      content.appendChild(btn);
    });
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

  openShop() {
    this.setMenuState('dynamic');
    this.renderBuyMenu();
  }

  renderBuyMenu() {
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    const shopItemKeys = this.db.shops[this.gameState.currentRoute];

    if (!shopItemKeys) {
      this.printToLog("This shop is currently closed.");
      setTimeout(() => this.setMenuState('route'), 1500);
      return;
    }

    this.printToLog("Welcome to the Poké Mart! What would you like to buy?");

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
          this.updateMoneyUI();
          this.printToLog(`You bought a ${itemData.name}!`);
        } else {
          this.printToLog(`You don't have enough money for a ${itemData.name}.`);
        }
      };
      content.appendChild(btn);
    });

    this.buildMenuControls(controls, [
      { text: "Buy", action: () => this.renderBuyMenu() },
      { text: "Sell", action: () => this.renderSellMenu() },
      { text: "Exit", action: () => { this.printToLog("Come again!"); this.setMenuState('route'); } }
    ]);
  }

  renderSellMenu() {
    const content = document.getElementById('dynamic-content');
    content.innerHTML = '';
    this.printToLog("What would you like to sell?");

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
        this.updateMoneyUI();
        this.printToLog(`You sold a ${itemData ? itemData.name : itemKey} for ¥${sellPrice}!`);
        this.renderSellMenu();
      };
      content.appendChild(btn);
    });
  } // <--- Added closing brace for renderSellMenu()

    handleItemClick(itemKey) {
    const item = this.db.items[itemKey]; // Assumes you have an items database
    
    if (item.category === "pokeball") {
      if (this.gameState.activeBattle) {
        // We are in battle, throw the ball!
        this.captureSystem.attemptCatch(itemKey);
      } else {
        this.printToLog("Oak's words echoed: There's a time and place for everything, but not now.");
      }
    } 
    else if (item.category === "medicine") {
      // Open the party screen to pick who gets healed
      this.openPartyTargetScreen(itemKey, item);
    }
  }

  openPartyTargetScreen(itemKey, itemData) {
    this.setMenuState('party-select');
    const container = document.getElementById('party-select-list');
    container.innerHTML = ''; // Clear old buttons

    this.gameState.party.forEach((mon, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.innerText = `${mon.species} (HP: ${mon.hp}/${mon.maxHp})`;
      
      btn.onclick = () => this.applyItemToPokemon(itemKey, itemData, index);
      container.appendChild(btn);
    });
  }

  applyItemToPokemon(itemKey, itemData, partyIndex) {
    const target = this.gameState.party[partyIndex];

    if (itemData.effect === "heal") {
      if (target.hp >= target.maxHp) {
        this.printToLog("It won't have any effect.");
        return; // Don't consume the item
      }
      
      // Heal and cap at maxHp
      target.hp = Math.min(target.maxHp, target.hp + itemData.healAmount);
      this.printToLog(`You used a ${itemData.name}! ${target.species} recovered health.`);
    }

    // Consume item
    this.gameState.inventory[itemKey]--;
    if (this.gameState.inventory[itemKey] <= 0) delete this.gameState.inventory[itemKey];

    this.updatePartyUI();

    // Return to the correct screen
    if (this.gameState.activeBattle) {
      // In battle, using an item uses your turn. The enemy attacks!
      this.setMenuState('battle');
      const enemyMove = this.battleEngine.getRandomEnemyMove();
      this.battleEngine.processAction(this.gameState.activeBattle.enemyMon, this.gameState.party[0], enemyMove, false);
      this.battleEngine.checkWinLoss();
    } else {
      this.setMenuState('system-menu'); // Or wherever your bag was opened from
    }
  }
  
} // <--- Added closing brace for GameEngine class

const game = new GameEngine();
game.init();

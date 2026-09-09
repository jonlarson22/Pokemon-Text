// facilities.js

export class FacilityManager {
  constructor(engine) {
    this.engine = engine;
  }

challengeGymLeader(gymId) {
    const gym = this.engine.db.gyms[gymId];
    if (!gym) return;

    const minionsDefeated = gym.gym_trainers.every(tId => 
      this.engine.gameState.defeatedTrainers[tId] || this.engine.gameState.flags[`defeated_${tId}`]
    );

    if (!minionsDefeated) {
      this.engine.ui.printToLog("You must defeat the Gym trainers before challenging the Gym Leader!");
      return;
    }

    const leaderData = this.engine.db.trainers[gym.gym_leader];
    if (!leaderData) {
      this.engine.ui.printToLog("Error: Gym Leader data not found!");
      return;
    }

    // NEW: Map the entire party array into generated Pokémon instances
    const enemyParty = leaderData.party.map(monData => 
      this.engine.factory.generatePokemonInstance(monData.species, monData.level)
    );

    // Pass the full array instead of just the first Pokémon
    this.engine.startTrainerBattle(
      enemyParty, 
      leaderData,
      gym.badge_reward 
    );
  }

  // --- POKÉ MART LOGIC ---
  openShop() {
    this.engine.ui.setMenuState('dynamic');
    this.renderBuyMenu();
  }

  renderBuyMenu() {
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    const shopItemKeys = this.engine.db.shops[this.engine.gameState.currentRoute];

    if (!shopItemKeys) {
      this.engine.ui.printToLog("This shop is currently closed.");
      setTimeout(() => this.engine.ui.setMenuState('route'), 1500);
      return;
    }

    this.engine.ui.printToLog("Welcome to the Poké Mart! What would you like to buy?");

    shopItemKeys.forEach(itemKey => {
      const itemData = this.engine.db.items[itemKey];
      if (!itemData) return;

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `${itemData.name} - ¥${itemData.price}`;
      btn.onclick = () => {
        if (this.engine.gameState.money >= itemData.price) {
          this.engine.gameState.money -= itemData.price;
          this.engine.gameState.inventory[itemKey] = (this.engine.gameState.inventory[itemKey] || 0) + 1;
          this.engine.ui.updateMoneyUI();
          this.engine.ui.printToLog(`You bought a ${itemData.name}!`);
        } else {
          this.engine.ui.printToLog(`You don't have enough money for a ${itemData.name}.`);
        }
      };
      content.appendChild(btn);
    });

    this.engine.ui.buildMenuControls(controls, [
      { text: "Buy", action: () => this.renderBuyMenu() },
      { text: "Sell", action: () => this.renderSellMenu() },
      { text: "Exit", action: () => { this.engine.ui.printToLog("Come again!"); this.engine.ui.setMenuState('route'); } }
    ]);
  }

  renderSellMenu() {
    const content = document.getElementById('dynamic-content');
    content.innerHTML = '';
    this.engine.ui.printToLog("What would you like to sell?");

    const inventoryEntries = Object.entries(this.engine.gameState.inventory).filter(([_, count]) => count > 0);

    if (inventoryEntries.length === 0) {
      const p = document.createElement('p');
      p.textContent = "Your bag is empty.";
      p.style.textAlign = "center";
      content.appendChild(p);
      return;
    }

    inventoryEntries.forEach(([itemKey, count]) => {
      const itemData = this.engine.db.items[itemKey];
      const basePrice = itemData ? itemData.price : 100;
      const sellPrice = Math.floor(basePrice / 2);

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Sell ${itemData ? itemData.name : itemKey} (x${count}) - ¥${sellPrice}`;
      btn.onclick = () => {
        this.engine.gameState.inventory[itemKey]--;
        if (this.engine.gameState.inventory[itemKey] <= 0) delete this.engine.gameState.inventory[itemKey];
        this.engine.gameState.money += sellPrice;
        this.engine.ui.updateMoneyUI();
        this.engine.ui.printToLog(`You sold a ${itemData ? itemData.name : itemKey} for ¥${sellPrice}!`);
        this.renderSellMenu();
      };
      content.appendChild(btn);
    });
  } 

  // --- POKÉMON CENTER LOGIC ---
  openCenter() {
    this.engine.ui.setMenuState('dynamic');
    this.engine.ui.printToLog("Welcome to the Pokémon Center!");
    this.renderCenterMenu();
  }

  renderCenterMenu() {
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    this.engine.ui.buildMenuControls(controls, [
      { text: "Heal Party", action: () => {
          this.engine.gameState.party.forEach(p => p.hp = p.maxHp);
          this.engine.gameState.lastHealedLocation = this.engine.gameState.currentRoute; 
          this.engine.ui.updatePartyUI();
          this.engine.ui.printToLog("Your Pokémon are fully healed!");
      }},
      { text: "PC: Deposit", action: () => this.renderPCDeposit() },
      { text: "PC: Withdraw", action: () => this.renderPCWithdraw() },
      { text: "Exit", action: () => { this.engine.ui.printToLog("We hope to see you again!"); this.engine.ui.setMenuState('route'); } }
    ]);
  }

  renderPCDeposit() {
    const content = document.getElementById('dynamic-content');
    content.innerHTML = '';
    this.engine.ui.printToLog("Select a Pokémon to deposit.");

    this.engine.gameState.party.forEach((mon, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Deposit ${mon.species} (Lv. ${mon.level})`;
      btn.onclick = () => {
        if (this.engine.gameState.party.length <= 1) {
          this.engine.ui.printToLog("You can't deposit your last Pokémon!");
          return;
        }
        const deposited = this.engine.gameState.party.splice(index, 1)[0];
        this.engine.gameState.pc.pokemon.push(deposited);
        this.engine.ui.updatePartyUI();
        this.engine.ui.printToLog(`Deposited ${deposited.species} in the PC.`);
        this.renderPCDeposit();
      };
      content.appendChild(btn);
    });
  }

  renderPCWithdraw() {
    const content = document.getElementById('dynamic-content');
    content.innerHTML = '';
    
    if (this.engine.gameState.pc.pokemon.length === 0) {
      this.engine.ui.printToLog("Your PC Box is empty.");
      return;
    }

    this.engine.ui.printToLog("Select a Pokémon to withdraw.");

    this.engine.gameState.pc.pokemon.forEach((mon, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Withdraw ${mon.species} (Lv. ${mon.level})`;
      btn.onclick = () => {
        if (this.engine.gameState.party.length >= 6) {
          this.engine.ui.printToLog("Your party is full!");
          return;
        }
        const withdrawn = this.engine.gameState.pc.pokemon.splice(index, 1)[0];
        this.engine.gameState.party.push(withdrawn);
        this.engine.ui.updatePartyUI();
        this.engine.ui.printToLog(`Withdrew ${withdrawn.species} from the PC.`);
        this.renderPCWithdraw();
      };
      content.appendChild(btn);
    });
  }
}

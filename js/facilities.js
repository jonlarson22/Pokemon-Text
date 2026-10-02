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

    // Badge flag comes from the gym's flag-type reward
    const badgeReward = (gym.rewards || []).find(r => r.type === "flag");

    // Generate the full party, applying custom movesets where the
    // moves exist in moves.json (missing ones are skipped gracefully)
    const enemyParty = this.engine.factory.generateTrainerParty(leaderData);

    // Pass the full array instead of just the first Pokémon
    this.engine.battleManager.startTrainerBattle(
      enemyParty,
      leaderData,
      badgeReward ? badgeReward.id : null
    );
  }

  // --- POKÉ MART LOGIC ---
  openShop(shopId = null, shopName = null) {
    this.engine.ui.setMenuState('dynamic');
    this.renderBuyMenu(shopId, shopName);
  }

  renderBuyMenu(shopId = null, shopName = null) {
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    const key = shopId || this.engine.gameState.currentRoute;
    const shopEntries = this.engine.db.shops[key];

    if (!shopEntries) {
      this.engine.ui.printToLog("This shop is currently closed.");
      setTimeout(() => this.engine.ui.setMenuState('route'), 1500);
      return;
    }

    const shopRoute = shopId ? this.engine.db.routes[shopId] : null;
    const displayName = shopName || (shopRoute ? shopRoute.name : null) || "Poké Mart";
    const useCoins = shopEntries.some(e => typeof e === 'object' && e.coinPrice);
    this.engine.ui.printToLog(`Welcome to the ${displayName}! What would you like to buy?`);
    if (useCoins) {
      const p = document.createElement('p');
      p.style.textAlign = 'center';
      p.textContent = `Your coins: ${this.engine.gameState.coins || 0}`;
      content.appendChild(p);
    }

    shopEntries.forEach(entry => {
      // Entries are either item keys (yen price from items.json) or
      // { key, coinPrice, kind: 'item'|'pokemon', level } for coin shops.
      const itemKey = typeof entry === 'string' ? entry : entry.key;
      const coinPrice = typeof entry === 'object' ? entry.coinPrice : null;
      const kind = typeof entry === 'object' ? (entry.kind || 'item') : 'item';

      const btn = document.createElement('button');
      btn.className = 'btn';

      if (kind === 'pokemon') {
        const pkmn = this.engine.db.pokemon ? this.engine.db.pokemon[itemKey] : null;
        const name = pkmn ? (pkmn.name || itemKey) : itemKey;
        const level = entry.level || 5;
        btn.textContent = `${name} (Lv.${level}) - ${coinPrice.toLocaleString()} coins`;
        btn.onclick = () => {
          if ((this.engine.gameState.coins || 0) >= coinPrice) {
            this.engine.gameState.coins -= coinPrice;
            this.engine.interactions.givePokemon(itemKey, level);
            this.engine.ui.updateMoneyUI();
            this.engine.ui.printToLog(`${name} joined your team!`);
            this.renderBuyMenu(shopId, shopName);
          } else {
            this.engine.ui.printToLog(`You don't have enough coins for ${name}.`);
          }
        };
      } else {
        const itemData = this.engine.db.items[itemKey];
        if (!itemData) return;
        if (coinPrice) {
          btn.textContent = `${itemData.name} - ${coinPrice.toLocaleString()} coins`;
          btn.onclick = () => {
            if ((this.engine.gameState.coins || 0) >= coinPrice) {
              this.engine.gameState.coins -= coinPrice;
              this.engine.gameState.inventory[itemKey] = (this.engine.gameState.inventory[itemKey] || 0) + 1;
              this.engine.ui.updateMoneyUI();
              this.engine.ui.printToLog(`You bought a ${itemData.name}!`);
              this.renderBuyMenu(shopId, shopName);
            } else {
              this.engine.ui.printToLog(`You don't have enough coins for a ${itemData.name}.`);
            }
          };
        } else {
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
        }
      }
      content.appendChild(btn);
    });

    const menuButtons = [
      { text: "Buy", action: () => this.renderBuyMenu(shopId, shopName) },
    ];
    // Coin prize counters don't buy your items back.
    if (!useCoins) menuButtons.push({ text: "Sell", action: () => this.renderSellMenu() });
    menuButtons.push({ text: "Exit", action: () => { this.engine.ui.printToLog("Come again!"); this.engine.ui.setMenuState('route'); } });
    this.engine.ui.buildMenuControls(controls, menuButtons);
  }

  // --- GAME CORNER: COIN EXCHANGE ---
  // Coins are a plain gameState number (no Coin Case item); the first visit
  // sets the obtained_coin_case flag so floor coins become findable.
  openCoinMenu() {
    if (!this.engine.hasFlag('obtained_coin_case')) {
      this.engine.setFlag('obtained_coin_case', true);
      this.engine.ui.printToLog("The clerk hands you a Coin Case! It can hold up to 9,999 coins.");
    }
    this.renderCoinMenu();
  }

  renderCoinMenu() {
    this.engine.ui.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    const p = document.createElement('p');
    p.style.textAlign = 'center';
    p.textContent = `Your coins: ${this.engine.gameState.coins || 0} — Your money: ¥${this.engine.gameState.money}`;
    content.appendChild(p);

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Buy 500 coins (¥1,000)';
    btn.onclick = () => {
      if (this.engine.gameState.money >= 1000) {
        this.engine.gameState.money -= 1000;
        this.engine.gameState.coins = Math.min(9999, (this.engine.gameState.coins || 0) + 500);
        this.engine.ui.updateMoneyUI();
        this.engine.ui.printToLog(`You bought 500 coins! (Total: ${this.engine.gameState.coins})`);
        this.renderCoinMenu();
      } else {
        this.engine.ui.printToLog("You don't have enough money for coins.");
      }
    };
    content.appendChild(btn);

    this.engine.ui.buildMenuControls(controls, [
      { text: "Done", action: () => { this.engine.ui.printToLog("Good luck in there!"); this.engine.ui.setMenuState('route'); } },
    ]);
  }

  // --- GAME CORNER: SLOT MACHINE (text-based) ---
  slotPayout(reels) {
    const [a, b, c] = reels;
    if (a === "7" && b === "7" && c === "7") return 300;
    if (a === "BAR" && b === "BAR" && c === "BAR") return 100;
    if (a === b && b === c) return 15;
    if (reels.filter(s => s === "Cherry").length === 2) return 8;
    return 0;
  }

  openSlotMachine() {
    this.engine.ui.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    const p = document.createElement('p');
    p.style.textAlign = 'center';
    p.textContent = `Your coins: ${this.engine.gameState.coins || 0}. How many coins do you want to bet?`;
    content.appendChild(p);

    [1, 2, 3].forEach(bet => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Bet ${bet} coin${bet > 1 ? 's' : ''}`;
      btn.onclick = () => {
        if ((this.engine.gameState.coins || 0) < bet) {
          this.engine.ui.printToLog("You don't have enough coins for that bet.");
          return;
        }
        this.engine.gameState.coins -= bet;
        this.engine.ui.updateMoneyUI();
        this.renderSlotSpin();
      };
      content.appendChild(btn);
    });

    this.engine.ui.buildMenuControls(controls, [
      { text: "Walk away", action: () => this.engine.ui.setMenuState('route') },
    ]);
  }

  renderSlotSpin() {
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    const symbols = ["7", "BAR", "Cherry", "Star", "Moon"];
    const reels = [null, null, null];
    const reelEls = [];

    const title = document.createElement('p');
    title.style.textAlign = 'center';
    title.style.fontWeight = 'bold';
    title.textContent = 'The reels are spinning... stop each one!';
    content.appendChild(title);

    for (let i = 0; i < 3; i++) {
      const el = document.createElement('p');
      el.style.textAlign = 'center';
      el.textContent = `Reel ${i + 1}: [ ? ]`;
      content.appendChild(el);
      reelEls.push(el);
    }

    const stopButtons = [];
    for (let i = 0; i < 3; i++) {
      stopButtons.push({ text: `Stop reel ${i + 1}`, action: () => {
        if (reels[i] !== null) return;
        reels[i] = symbols[Math.floor(Math.random() * symbols.length)];
        reelEls[i].textContent = `Reel ${i + 1}: [ ${reels[i]} ]`;
        if (reels.every(r => r !== null)) this.resolveSlotSpin(reels);
        else this.renderSlotSpinContinue(reels, reelEls);
      } });
    }
    stopButtons.push({ text: "Give up", action: () => this.engine.ui.setMenuState('route') });
    this.engine.ui.buildMenuControls(controls, stopButtons);
  }

  // Re-render the stop buttons after each stop so spent reels can't be re-stopped.
  renderSlotSpinContinue(reels, reelEls) {
    const controls = document.getElementById('dynamic-controls');
    controls.innerHTML = '';
    const stopButtons = [];
    for (let i = 0; i < 3; i++) {
      if (reels[i] !== null) continue;
      stopButtons.push({ text: `Stop reel ${i + 1}`, action: () => {
        const symbols = ["7", "BAR", "Cherry", "Star", "Moon"];
        reels[i] = symbols[Math.floor(Math.random() * symbols.length)];
        reelEls[i].textContent = `Reel ${i + 1}: [ ${reels[i]} ]`;
        if (reels.every(r => r !== null)) this.resolveSlotSpin(reels);
        else this.renderSlotSpinContinue(reels, reelEls);
      } });
    }
    stopButtons.push({ text: "Give up", action: () => this.engine.ui.setMenuState('route') });
    this.engine.ui.buildMenuControls(controls, stopButtons);
  }

  resolveSlotSpin(reels) {
    const payout = this.slotPayout(reels);
    if (payout > 0) {
      this.engine.gameState.coins = Math.min(9999, (this.engine.gameState.coins || 0) + payout);
      this.engine.ui.printToLog(`[ ${reels.join(' | ')} ] — You won ${payout} coins!`);
    } else {
      this.engine.ui.printToLog(`[ ${reels.join(' | ')} ] — No luck this time.`);
    }
    this.engine.ui.updateMoneyUI();
    const controls = document.getElementById('dynamic-controls');
    this.engine.ui.buildMenuControls(controls, [
      { text: "Play again", action: () => this.openSlotMachine() },
      { text: "Cash out", action: () => this.engine.ui.setMenuState('route') },
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
          this.engine.gameState.party.forEach(p => {
            p.hp = p.maxHp;
            p.status = null;
            if (p.moves) {
              p.moves.forEach(m => {
                if (m.maxPp !== undefined) m.pp = m.maxPp;
              });
            }
          });
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

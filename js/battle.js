// js/battle.js
export class BattleEngine {
constructor(playerMon, enemyParty, onLog, onVictory, onBlackout, onForceSwitch, typeChart = null, party, trainerName = "Wild", enemyItems = []) {
    this.playerMon = playerMon;
    this.enemyParty = Array.isArray(enemyParty) ? enemyParty : [enemyParty];
    this.enemyMon = this.enemyParty[0];
    this.trainerName = trainerName;
    this.onLog = onLog;
    this.onVictory = onVictory; 
    this.onBlackout = onBlackout;
    this.onForceSwitch = onForceSwitch;
    this.typeChart = typeChart;
    this.party = party;
    this.isOver = false;
    this.enemyItems = [...enemyItems];

    this.participants = new Set([this.playerMon]);

    this.setupBattleStats(this.playerMon);
    this.setupBattleStats(this.enemyMon);
  }

  setupBattleStats(mon) {
    mon.statStages = { attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0, accuracy: 0, evasion: 0 };
    if (!mon.status) mon.status = null; 
    if (!mon.sleepTurns) mon.sleepTurns = 0;
    mon.seeded = false;
  }

  getModifiedStat(mon, statName) {
    const stage = mon.statStages[statName] || 0;
    const multiplier = stage >= 0 ? (2 + stage) / 2 : 2 / (2 + Math.abs(stage));
    
    let val = (statName === 'speed') ? mon.speed : (mon.stats ? mon.stats[statName] : mon[statName]);
    let modified = Math.floor(val * multiplier);

    if (statName === 'speed' && mon.status === 'PAR') modified = Math.floor(modified * 0.5);
    if (statName === 'attack' && mon.status === 'BRN') modified = Math.floor(modified * 0.5);
    
    return modified;
  }

  /**
   * Manual Mid-Battle Switch (Consumes Player Turn)
   */
  switchPokemon(newMon) {
    if (this.isOver || newMon.hp <= 0 || newMon === this.playerMon) return false;

    this.onLog(`Retrieved ${this.playerMon.species}! Go! ${newMon.species}!`);
    this.playerMon = newMon;
    this.setupBattleStats(this.playerMon);
    this.participants.add(this.playerMon);

    // Enemy gets a turn because switching takes an action
    if (this.canMove(this.enemyMon)) {
      const enemyMove = this.getRandomEnemyMove();
      this.processAction(this.enemyMon, this.playerMon, enemyMove, false);
    }

    this.applyEndOfTurnEffects(this.playerMon, this.enemyMon);
    this.checkWinLoss();
    return true;
  }

  /**
   * Forced Switch after Faint (Does NOT trigger enemy attack)
   */
  forceSwitchPokemon(newMon) {
    if (newMon.hp <= 0) return false;

    this.playerMon = newMon;
    this.setupBattleStats(this.playerMon);
    this.participants.add(this.playerMon);
    this.onLog(`Go! ${this.playerMon.species}!`);
    return true;
  }

executeTurn(playerMove) {
    if (this.isOver) return;

    // AI Item Check (Items have +1 priority)
    const enemyUsedItem = this.tryUseEnemyItem();

    if (enemyUsedItem) {
      // If the enemy used an item, they skip their attack this turn. 
      // The player proceeds with their move.
      if (this.canMove(this.playerMon)) {
        this.processAction(this.playerMon, this.enemyMon, playerMove, true);
      }
      if (this.checkWinLoss()) return;

      this.applyEndOfTurnEffects(this.playerMon, this.enemyMon);
      this.checkWinLoss();
      return; // End the turn sequence here
    }

    // Normal Turn Execution (No item was used)
    const playerSpd = this.getModifiedStat(this.playerMon, 'speed');
    const enemySpd = this.getModifiedStat(this.enemyMon, 'speed');
    const playerFirst = playerSpd >= enemySpd;

    const firstAttacker = playerFirst ? this.playerMon : this.enemyMon;
    const firstDefender = playerFirst ? this.enemyMon : this.playerMon;
    const firstMove = playerFirst ? playerMove : this.getRandomEnemyMove();

    const secondAttacker = playerFirst ? this.enemyMon : this.playerMon;
    const secondDefender = playerFirst ? this.playerMon : this.enemyMon;
    const secondMove = playerFirst ? this.getRandomEnemyMove() : playerMove;

    if (this.canMove(firstAttacker)) {
      this.processAction(firstAttacker, firstDefender, firstMove, playerFirst);
    }
    if (this.checkWinLoss()) return;

    if (this.canMove(secondAttacker)) {
      this.processAction(secondAttacker, secondDefender, secondMove, !playerFirst);
    }
    if (this.checkWinLoss()) return;

    this.applyEndOfTurnEffects(firstAttacker, firstDefender);
    if (this.checkWinLoss()) return;
    
    this.applyEndOfTurnEffects(secondAttacker, firstAttacker);
    this.checkWinLoss();
  }

  getRandomEnemyMove() {
    if (!this.enemyMon.moves || this.enemyMon.moves.length === 0) {
      return { name: "Struggle", type: "Normal", category: "physical", power: 50, accuracy: 100 };
    }
    const randomIndex = Math.floor(Math.random() * this.enemyMon.moves.length);
    return this.enemyMon.moves[randomIndex];
  }

  canMove(mon) {
    if (mon.status === 'SLP') {
      mon.sleepTurns--;
      if (mon.sleepTurns <= 0) {
        mon.status = null;
        this.onLog(`${mon.species} woke up!`);
        return true;
      }
      this.onLog(`${mon.species} is fast asleep.`);
      return false;
    }
    if (mon.status === 'FRZ') {
      if (Math.random() < 0.20) {
        mon.status = null;
        this.onLog(`${mon.species} thawed out!`);
        return true;
      }
      this.onLog(`${mon.species} is frozen solid!`);
      return false;
    }
    if (mon.status === 'PAR') {
      if (Math.random() < 0.25) {
        this.onLog(`${mon.species} is paralyzed! It can't move!`);
        return false;
      }
    }
    return true;
  }

  applyEndOfTurnEffects(mon, opponent) {
    if (mon.hp <= 0) return;

    if (mon.status === 'PSN' || mon.status === 'BRN') {
      const damage = Math.max(1, Math.floor(mon.maxHp / 8));
      const actualDamage = Math.min(mon.hp, damage);
      mon.hp -= actualDamage;
      const statusName = mon.status === 'PSN' ? 'poison' : 'burn';
      this.onLog(`${mon.species} is hurt by its ${statusName}! (-${actualDamage} HP, ${mon.hp}/${mon.maxHp} HP)`);
    }

    if (mon.seeded && mon.hp > 0) {
      const drainAmount = Math.max(1, Math.floor(mon.maxHp / 8));
      const actualDrain = Math.min(mon.hp, drainAmount);
      mon.hp -= actualDrain;
      this.onLog(`${mon.species}'s health was sapped by Leech Seed! (-${actualDrain} HP, ${mon.hp}/${mon.maxHp} HP)`);

      if (opponent && opponent.hp > 0) {
        const oldHp = opponent.hp;
        opponent.hp = Math.min(opponent.maxHp, opponent.hp + actualDrain);
        const actualHeal = opponent.hp - oldHp;
        this.onLog(`${opponent.species} absorbed ${actualHeal} HP! (${opponent.hp}/${opponent.maxHp} HP)`);
      }
    }
  }
  
  applyStatus(target, status) {
    if (target.status) return;
    target.status = status;
    
    switch(status) {
      case 'SLP':
        target.sleepTurns = Math.floor(Math.random() * 3) + 2;
        this.onLog(`${target.species} fell asleep!`);
        break;
      case 'PSN':
        this.onLog(`${target.species} was poisoned!`);
        break;
      case 'BRN':
        this.onLog(`${target.species} was burned!`);
        break;
      case 'PAR':
        this.onLog(`${target.species} was paralyzed!`);
        break;
      case 'FRZ':
        this.onLog(`${target.species} was frozen solid!`);
        break;
    }
  }

  applyStatChange(target, stat, stages) {
    const current = target.statStages[stat];
    if (stages > 0 && current >= 6) {
      this.onLog(`${target.species}'s ${stat} won't go any higher!`);
      return;
    }
    if (stages < 0 && current <= -6) {
      this.onLog(`${target.species}'s ${stat} won't go any lower!`);
      return;
    }

    target.statStages[stat] = Math.max(-6, Math.min(6, current + stages));
    
    if (stages >= 2) this.onLog(`${target.species}'s ${stat} rose sharply!`);
    else if (stages === 1) this.onLog(`${target.species}'s ${stat} rose!`);
    else if (stages === -1) this.onLog(`${target.species}'s ${stat} fell!`);
    else if (stages <= -2) this.onLog(`${target.species}'s ${stat} harshly fell!`);
  }

    tryUseEnemyItem() {
      if (!this.enemyItems || this.enemyItems.length === 0) return false;
    
      const hpRatio = this.enemyMon.hp / this.enemyMon.maxHp;
    
      // AI condition: Heal when at or below 25% HP
      if (hpRatio <= 0.25) {
        const itemIndex = this.enemyItems.findIndex(i => i.effect?.type === "heal");
    
        if (itemIndex !== -1) {
          const item = this.enemyItems.splice(itemIndex, 1)[0];
          const healAmount = item.effect.value;
    
          const oldHp = this.enemyMon.hp;
          this.enemyMon.hp = Math.min(this.enemyMon.maxHp, this.enemyMon.hp + healAmount);
          const actualHeal = this.enemyMon.hp - oldHp;
    
          this.onLog(`${this.trainerName} used a ${item.name} on ${this.enemyMon.species}!`);
          this.onLog(`${this.enemyMon.species} recovered ${actualHeal} HP! (${this.enemyMon.hp}/${this.enemyMon.maxHp} HP)`);
          return true; // Item was used, consuming the turn
        }
      }
      return false;
    }
  
  processAction(attacker, defender, move, isPlayer) {
    if (attacker.hp <= 0) return;

    this.onLog(`${attacker.species} used ${move.name}!`);

    if (move.accuracy) {
      const accStage = attacker.statStages.accuracy || 0;
      const evaStage = defender.statStages.evasion || 0;
      const netStage = Math.max(-6, Math.min(6, accStage - evaStage));
      const multiplier = netStage >= 0 ? (3 + netStage) / 3 : 3 / (3 + Math.abs(netStage));
      const finalAccuracy = move.accuracy * multiplier;

      if (Math.random() * 100 > finalAccuracy) {
        this.onLog(`${attacker.species}'s attack missed!`);
        return;
      }
    }

    if (move.category === "status" || move.power === 0) {
      if (move.effect) {
        if (move.effect.type === "leech_seed") {
          const target = move.effect.target === "self" ? attacker : defender;
          if (target.seeded) {
            this.onLog(`${target.species} is already seeded!`);
          } else {
            target.seeded = true;
            this.onLog(`${target.species} was seeded!`);
          }
        } else if (move.effect.type === "status") {
          const target = move.effect.target === "self" ? attacker : defender;
          this.applyStatus(target, move.effect.condition);
        } else if (move.effect.type === "stat") {
          const target = move.effect.target === "self" ? attacker : defender;
          this.applyStatChange(target, move.effect.stat, move.effect.stages);
        }
      } else {
        this.onLog(`It had no effect!`);
      }
      return;
    }

    const isCrit = Math.random() < 0.0625;
    const levelFactor = (2 * attacker.level / 5) + 2;
    const atkStat = move.category === "special" ? this.getModifiedStat(attacker, 'spAtk') : this.getModifiedStat(attacker, 'attack');
    const defStat = move.category === "special" ? this.getModifiedStat(defender, 'spDef') : this.getModifiedStat(defender, 'defense');

    let baseDamage = ((levelFactor * move.power * (atkStat / defStat)) / 50) + 2;

    let stabMultiplier = (attacker.types && attacker.types.includes(move.type)) ? 1.5 : 1.0;
    let typeMultiplier = 1.0;

    if (this.typeChart && defender.types) {
      const moveTypeLower = move.type.toLowerCase();
      defender.types.forEach(defType => {
        const defTypeLower = defType.toLowerCase();
        if (this.typeChart[moveTypeLower] && this.typeChart[moveTypeLower][defTypeLower] !== undefined) {
          typeMultiplier *= this.typeChart[moveTypeLower][defTypeLower];
        }
      });
    }

    if (typeMultiplier === 0) {
      this.onLog(`It had no effect on ${defender.species}!`);
      return; 
    }

    const critMultiplier = isCrit ? 1.5 : 1.0;
    const randomFactor = (Math.floor(Math.random() * 16) + 85) / 100;

    let finalDamage = Math.floor(baseDamage * stabMultiplier * typeMultiplier * critMultiplier * randomFactor);
    finalDamage = Math.max(1, finalDamage); 

    defender.hp = Math.max(0, defender.hp - finalDamage);

    if (isCrit) this.onLog(`A critical hit!`);
    if (typeMultiplier > 1.0) this.onLog(`It's super effective!`);
    else if (typeMultiplier < 1.0) this.onLog(`It's not very effective...`);

    this.onLog(`${defender.species} took ${finalDamage} damage! (${defender.hp}/${defender.maxHp} HP)`);
    
    if (move.name === "Struggle") {
      const recoil = Math.max(1, Math.floor(attacker.maxHp / 4));
      attacker.hp = Math.max(0, attacker.hp - recoil);
      this.onLog(`${attacker.species} is hit with recoil! (${attacker.hp}/${attacker.maxHp} HP)`);
    }
      
    if (move.drain || move.effect?.type === "drain") {
      const drainRatio = move.drain || 0.5;
      const recovered = Math.min(attacker.maxHp - attacker.hp, Math.max(1, Math.floor(finalDamage * drainRatio)));
      if (recovered > 0) {
        attacker.hp += recovered;
        this.onLog(`${attacker.species} drained health and recovered ${recovered} HP!`);
      }
    }

    if (move.secondaryEffect && move.secondaryEffect.chance) {
      if (Math.random() * 100 <= move.secondaryEffect.chance) {
        const target = move.secondaryEffect.target === "self" ? attacker : defender;
        if (move.secondaryEffect.type === "status") {
          this.applyStatus(target, move.secondaryEffect.condition);
        } else if (move.secondaryEffect.type === "stat") {
          this.applyStatChange(target, move.secondaryEffect.stat, move.secondaryEffect.stages);
        }
      }
    }
  }

 checkWinLoss() {
    if (this.enemyMon.hp <= 0) {
      const prefix = this.trainerName === "Wild" ? "Wild" : `${this.trainerName}'s`;
      this.onLog(`${prefix} ${this.enemyMon.species} fainted!`);

      const nextEnemy = this.enemyParty.find(mon => mon.hp > 0);
      
      if (nextEnemy) {
        this.enemyMon = nextEnemy;
        this.setupBattleStats(this.enemyMon);
        this.onLog(`${this.trainerName} sent out ${this.enemyMon.species}!`);
        return true; 
      }

      if (this.trainerName === "Wild") {
        this.onLog(`You defeated the wild ${this.enemyMon.species}!`);
      }
      this.isOver = true; 
      if (this.onVictory) this.onVictory(Array.from(this.participants), this.enemyMon); 
      return true;
    }

    if (this.playerMon.hp <= 0) {
      this.onLog(`${this.playerMon.species} fainted!`);
      const hasHealthyMon = this.party.some(mon => mon.hp > 0);
      
      if (hasHealthyMon) {
        this.onLog(`Choose another Pokémon!`);
        if (this.onForceSwitch) this.onForceSwitch();
      } else {
        this.onLog(`You have no more usable Pokémon... You whited out!`);
        this.isOver = true;
        if (this.onBlackout) this.onBlackout();
      }
      return true;
    }
    return false;
  }
}

export class BattleManager {
  constructor(gameEngine) {
    this.game = gameEngine;
  }

  startBattle(wildPokemonInfo) {
    const speciesKey = wildPokemonInfo.species.toLowerCase();
    this.game.gameState.pokedex.seen[speciesKey] = true;
    this.game.ui.updatePokedexTrackerUI();

    const enemyMon = this.game.factory.generatePokemonInstance(wildPokemonInfo.species, wildPokemonInfo.level);
    if (!enemyMon) {
      this.game.ui.printToLog("Error generating wild Pokémon stats!");
      return;
    }

    this.game.ui.printToLog(`A wild ${enemyMon.species} (Lv. ${enemyMon.level}) appeared!`);
    
    this.game.gameState.activeBattle = new BattleEngine(
      this.game.gameState.party[0], 
      enemyMon, 
      (msg) => {
        this.game.ui.printToLog(msg);
        this.game.ui.updatePartyUI();
      },
      (participants, defeatedEnemy) => this.game.growth.awardExp(participants, defeatedEnemy),
      () => this.checkBlackout(),
      () => { 
        this.game.ui.printToLog("Choose a Pokémon to send out!");
        this.game.ui.openPokemonMenu();
      },
      this.game.db.typeChart,
      this.game.gameState.party
    );

    this.game.ui.refreshBattleMoveButtons();
    const battleBagBtn = document.getElementById('btn-battle-bag');
    if (battleBagBtn) battleBagBtn.onclick = () => this.game.openBag();

    this.game.ui.setMenuState('battle');
  }

startTrainerBattle(enemyParty, trainer, winFlag = null) {
    const activeEnemyParty = Array.isArray(enemyParty) ? enemyParty : [enemyParty];
    
    activeEnemyParty.forEach(mon => {
      const speciesKey = mon.species.toLowerCase();
      this.game.gameState.pokedex.seen[speciesKey] = true;
    });
    this.game.ui.updatePokedexTrackerUI();

    this.game.ui.printToLog(`${trainer.name} sent out ${activeEnemyParty[0].species} (Lv. ${activeEnemyParty[0].level})!`);
    
    const enemyItems = (trainer.items || []).map(itemId => {
      const itemObj = this.game.db.items[itemId];
      return itemObj ? { ...itemObj } : null;
    }).filter(item => item !== null);

    this.game.gameState.activeBattle = new BattleEngine(
      this.game.gameState.party[0], 
      activeEnemyParty, 
      (msg) => {
        this.game.ui.printToLog(msg);
        this.game.ui.updatePartyUI();
      },
      (participants, defeatedEnemy) => this.game.growth.awardExp(participants, defeatedEnemy),
      () => this.checkBlackout(),
      () => { 
        this.game.ui.printToLog("Choose a Pokémon to send out!");
        this.game.ui.openPokemonMenu();
      },
      this.game.db.typeChart,
      this.game.gameState.party,
      trainer.name, 
      enemyItems  
    );

    this.game.ui.refreshBattleMoveButtons();
    const battleBagBtn = document.getElementById('btn-battle-bag');
    if (battleBagBtn) battleBagBtn.onclick = () => this.game.openBag();

    this.game.gameState.activeTrainer = trainer;    
    this.game.gameState.activeWinFlag = winFlag;
    this.game.ui.setMenuState('battle');
  }

    handleTurn(playerMove) {
    if (!this.game.gameState.activeBattle) return;

    // Check if the player has no moves with PP left
    const allOutOfPP = this.game.gameState.activeBattle.playerMon.moves.every(m => m.pp === 0);
    
    if (allOutOfPP) {
      // Force struggle
      playerMove = { name: "Struggle", type: "Normal", category: "physical", power: 50, accuracy: 100 };
    } else if (playerMove.pp !== undefined && playerMove.pp <= 0) {
      // Prevent the player from clicking a move with 0 PP
      this.game.ui.printToLog(`${playerMove.name} has no PP left!`);
      return; 
    } else if (playerMove.pp !== undefined) {
      playerMove.pp--;
    }
    
    this.game.gameState.activeBattle.executeTurn(playerMove);
    if (this.game.gameState.activeBattle && this.game.gameState.activeBattle.isOver) {
      this.handleBattleEnd();
    }
  }

handleBattleEnd() {
    if (this.checkBlackout()) return; 

    if (this.game.gameState.activeBattle && this.game.gameState.activeTrainer) {
      const trainer = this.game.gameState.activeTrainer;

      if (trainer.dialogueAfter) {
        this.game.ui.printToLog(`${trainer.name}: "${trainer.dialogueAfter}"`);
      }

      const payout = trainer.rewardMoney ?? trainer.payout ?? 500;
      this.game.gameState.money += payout;
      this.game.ui.printToLog(`You defeated ${trainer.name} and got ¥${payout}!`);
      this.game.gameState.defeatedTrainers[this.game.gameState.activeTrainerId] = true;  
      this.game.ui.updateMoneyUI();
      
      if (this.game.gameState.activeWinFlag) {
        this.game.setFlag(this.game.gameState.activeWinFlag, true);
      }

      if (trainer.rewards && trainer.rewards.length > 0) {
        this.processBattleRewards(trainer.rewards);
        return; 
      }
    }
    
    this.finishBattleCleanup();
  }

  processBattleRewards(rewards) {
    let requiresChoice = false;

    rewards.forEach(reward => {
      switch (reward.type) {
        case "flag":
          this.game.setFlag(reward.id, true);
          break;
        case "item":
          // Assuming game.inventory.addItem exists, adjust to match your inventory system
          if (this.game.inventory) {
            this.game.inventory.addItem(reward.id, reward.quantity || 1);
          }
          const itemName = this.game.db.items && this.game.db.items[reward.id] ? this.game.db.items[reward.id].name : reward.id;
          this.game.ui.printToLog(`Obtained ${reward.quantity || 1}x ${itemName}!`);
          break;
        case "pokemon_choice":
          requiresChoice = true;
          this.promptPokemonChoice(reward.choices);
          break;
      }
    });

    // If there was no UI interaction required, immediately finish cleanup
    if (!requiresChoice) {
      this.finishBattleCleanup();
    }
  }

  promptPokemonChoice(choices) {
    this.game.ui.printToLog(`Choose your reward Pokémon!`);
    this.game.ui.setMenuState('dynamic');

    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    
    content.innerHTML = '<p style="text-align:center; font-weight:bold;">Take which Pokémon?</p>';
    controls.innerHTML = '';

    const buttons = choices.map(choice => ({
      text: `${choice.species} (Lv. ${choice.level})`,
      action: () => this.awardPokemonAndFinish(choice)
    }));

    this.game.ui.buildMenuControls(controls, buttons);
  }

  awardPokemonAndFinish(choiceData) {
    const newMon = this.game.factory.generatePokemonInstance(choiceData.species, choiceData.level);
    
    if (newMon) {
      if (this.game.gameState.party.length < 6) {
        this.game.gameState.party.push(newMon);
        this.game.ui.printToLog(`Added ${newMon.species} to your party!`);
      } else {
        // Fallback if you have a PC box system implemented
        if (!this.game.gameState.pc) this.game.gameState.pc = [];
        this.game.gameState.pc.push(newMon);
        this.game.ui.printToLog(`Sent ${newMon.species} to the PC!`);
      }
      this.game.ui.updatePartyUI();
    }

    this.finishBattleCleanup();
  }

  finishBattleCleanup() {
    this.game.gameState.activeTrainer = null;
    this.game.gameState.activeBattle = null;
    this.game.gameState.activeWinFlag = null; 
    this.game.gameState.activeTrainerPartyIndex = 0; 

    setTimeout(() => {
      this.game.ui.printToLog("Returning to the route...");
      this.game.ui.setMenuState('route');
    }, 500);
  }

  checkBlackout() {
    const isWiped = this.game.gameState.party.every(p => p.hp <= 0);
    if (isWiped) {
      this.game.ui.printToLog("You hurried away to protect your Pokemon from further harm.");
      this.game.gameState.money = Math.min(Math.floor(this.game.gameState.money / 2), 5000);
      this.game.gameState.currentRoute = this.game.gameState.lastHealedLocation || "pallet_town";
      
      this.game.gameState.party.forEach(p => {
        p.hp = p.maxHp;
        if (p.moves) p.moves.forEach(m => { if (m.maxPp !== undefined) m.pp = m.maxPp; });
      });
      
      this.game.ui.updateMoneyUI();
      this.game.ui.updatePartyUI();

      this.game.gameState.activeTrainer = null;
      this.game.gameState.activeBattle = null;

      this.game.gameState.activeWinFlag = null;
      this.game.gameState.activeTrainerPartyIndex = 0;
      
      setTimeout(() => {
        this.game.ui.renderRouteScreen();
        this.game.ui.setMenuState('route');
      }, 500);
      return true;
    }
    return false;
  }

  promptTrainerSwitch(nextMonData, trainer) {
    this.game.ui.printToLog(`${trainer.name} is about to send out ${nextMonData.species}.`);
    this.game.ui.printToLog(`Will you switch your Pokémon?`);

    this.game.gameState.pendingEnemyMonData = nextMonData;

    this.game.ui.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    
    content.innerHTML = '<p style="text-align:center; font-weight:bold;">Change Pokémon?</p>';
    controls.innerHTML = '';

    this.game.ui.buildMenuControls(controls, [
      { text: "Yes", action: () => this.openTrainerSwitchMenu() },
      { text: "No", action: () => this.sendNextTrainerPokemon() }
    ]);
  }

  openTrainerSwitchMenu() {
    this.game.ui.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '';
    controls.innerHTML = '';

    this.game.gameState.party.forEach((mon, index) => {
      const pbox = document.createElement('div');
      pbox.style.border = "1px solid #ccc";
      pbox.style.padding = "8px";
      pbox.style.marginBottom = "8px";
      pbox.style.cursor = mon.hp > 0 ? "pointer" : "not-allowed";
      pbox.style.opacity = mon.hp > 0 ? "1" : "0.5";

      pbox.innerHTML = `<strong>${mon.species} (Lv. ${mon.level})</strong> - ${mon.types.join('/')}<br>HP: ${mon.hp}/${mon.maxHp}`;

      pbox.onclick = () => {
        if (mon.hp > 0) {
          if (index !== 0) { 
            const temp = this.game.gameState.party[0];
            this.game.gameState.party[0] = this.game.gameState.party[index];
            this.game.gameState.party[index] = temp;
            this.game.ui.printToLog(`You sent out ${this.game.gameState.party[0].species}!`);
          }
          this.sendNextTrainerPokemon();
        }
      };
      content.appendChild(pbox);
    });

    this.game.ui.buildMenuControls(controls, [
      { text: "Cancel (Keep Current)", action: () => this.sendNextTrainerPokemon() }
    ]);
  }

  getTrainerMonMoves(trainerMonData) {
    if (trainerMonData.moves && trainerMonData.moves.length > 0) {
      return trainerMonData.moves;
    }

    // 2. Look up the species in your database 
    // (Note: Adjust 'this.game.pokemonData' to match your actual database variable)
    const speciesInfo = this.game.pokemonData[trainerMonData.species]; 

    if (!speciesInfo || !speciesInfo.learnset) {
      return []; 
    }

    // 3. Filter the learnset for moves at or below the current level
    const availableMoves = speciesInfo.learnset
      .filter(learnInfo => learnInfo.level <= trainerMonData.level)
      .map(learnInfo => learnInfo.move);

    // 4. Return up to the 4 most recent moves
    return availableMoves.slice(-4); 
  }
    
  sendNextTrainerPokemon() {
    const nextMonData = this.game.gameState.pendingEnemyMonData;
    this.game.gameState.pendingEnemyMonData = null; 

    const enemyMon = this.game.factory.generatePokemonInstance(nextMonData.species, nextMonData.level);
    if (!enemyMon) return;

    if (nextMonData.moves) {
        enemyMon.moves = nextMonData.moves.map(moveId => this.game.db.moves[moveId]).filter(m => m);
    }

    const speciesKey = enemyMon.species.toLowerCase();
    this.game.gameState.pokedex.seen[speciesKey] = true;
    this.game.ui.updatePokedexTrackerUI();

    this.game.ui.printToLog(`${this.game.gameState.activeTrainer.name} sent out ${enemyMon.species}!`);
    
    this.game.gameState.activeBattle.enemyMon = enemyMon;
    this.game.gameState.activeBattle.isOver = false;
    
    this.game.ui.refreshBattleMoveButtons();
    this.game.ui.setMenuState('battle');
  }
}

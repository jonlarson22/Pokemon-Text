// js/battle.js
export class BattleEngine {
  constructor(playerMon, enemyMon, onLog, typeChart = null) {
    this.playerMon = playerMon;
    this.enemyMon = enemyMon;
    this.onLog = onLog;
    this.typeChart = typeChart; 
    this.isOver = false;

    // Initialize volatile battle states for this fight
    this.setupBattleStats(this.playerMon);
    this.setupBattleStats(this.enemyMon);
  }

  setupBattleStats(mon) {
    mon.statStages = { attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 };
    if (!mon.status) mon.status = null; // "BRN", "PSN", "SLP", "PAR", "FRZ"
    if (!mon.sleepTurns) mon.sleepTurns = 0;
  }

  // Helper to calculate effective stats with stage multipliers (-6 to +6)
  getModifiedStat(mon, statName) {
    const stage = mon.statStages[statName] || 0;
    // Standard multiplier formula: (2+stage)/2 for buffs, 2/(2-stage) for debuffs
    const multiplier = stage >= 0 ? (2 + stage) / 2 : 2 / (2 - Math.abs(stage));
    
    let val = (statName === 'speed') ? mon.speed : mon.stats[statName];
    let modified = Math.floor(val * multiplier);

    // Paralysis cuts Speed by 50%
    if (statName === 'speed' && mon.status === 'PAR') {
      modified = Math.floor(modified * 0.5);
    }
    // Burn cuts physical Attack by 50%
    if (statName === 'attack' && mon.status === 'BRN') {
      modified = Math.floor(modified * 0.5);
    }
    
    return modified;
  }

  executeTurn(playerMove) {
    if (this.isOver) return;

    // 1. Determine turn order based on modified Speed stat
    const playerSpd = this.getModifiedStat(this.playerMon, 'speed');
    const enemySpd = this.getModifiedStat(this.enemyMon, 'speed');
    const playerFirst = playerSpd >= enemySpd;

    const firstAttacker = playerFirst ? this.playerMon : this.enemyMon;
    const firstDefender = playerFirst ? this.enemyMon : this.playerMon;
    const firstMove = playerFirst ? playerMove : this.getRandomEnemyMove();

    const secondAttacker = playerFirst ? this.enemyMon : this.playerMon;
    const secondDefender = playerFirst ? this.playerMon : this.enemyMon;
    const secondMove = playerFirst ? this.getRandomEnemyMove() : playerMove;

    // Execute First Move
    if (this.canMove(firstAttacker)) {
      this.processAction(firstAttacker, firstDefender, firstMove, playerFirst);
    }
    if (this.checkWinLoss()) return;

    // Execute Second Move
    if (this.canMove(secondAttacker)) {
      this.processAction(secondAttacker, secondDefender, secondMove, !playerFirst);
    }
    if (this.checkWinLoss()) return;

    // End of Turn Effects (Poison, Burn)
    this.applyEndOfTurnEffects(firstAttacker);
    if (this.checkWinLoss()) return;
    this.applyEndOfTurnEffects(secondAttacker);
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
      if (Math.random() < 0.20) { // 20% chance to thaw each turn
        mon.status = null;
        this.onLog(`${mon.species} thawed out!`);
        return true;
      }
      this.onLog(`${mon.species} is frozen solid!`);
      return false;
    }
    if (mon.status === 'PAR') {
      if (Math.random() < 0.25) { // 25% chance to lose turn
        this.onLog(`${mon.species} is paralyzed! It can't move!`);
        return false;
      }
    }
    return true;
  }

  applyEndOfTurnEffects(mon) {
    if (mon.hp <= 0) return;
    if (mon.status === 'PSN' || mon.status === 'BRN') {
      const damage = Math.max(1, Math.floor(mon.maxHp / 8)); // 1/8th max HP damage
      mon.hp = Math.max(0, mon.hp - damage);
      const statusName = mon.status === 'PSN' ? 'poison' : 'burn';
      this.onLog(`${mon.species} is hurt by its ${statusName}! (${mon.hp}/${mon.maxHp} HP)`);
    }
  }

  applyStatus(target, status) {
    if (target.status) return; // Can't stack status conditions
    target.status = status;
    
    switch(status) {
      case 'SLP':
        target.sleepTurns = Math.floor(Math.random() * 3) + 2; // Random 2 to 4 turns
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

  processAction(attacker, defender, move, isPlayer) {
    if (attacker.hp <= 0) return;

    this.onLog(`${attacker.species} used ${move.name}!`);

    // 2. Accuracy Check
    if (move.accuracy && move.accuracy < 100) {
      const roll = Math.random() * 100;
      if (roll > move.accuracy) {
        this.onLog(`But it missed!`);
        return;
      }
    }

    // Handle Status Moves / Buffs / Debuffs
    if (move.category === "status" || move.power === 0) {
      if (move.effect) {
        // Example: { "type": "status", "condition": "SLP", "target": "enemy" }
        if (move.effect.type === "status") {
          const target = move.effect.target === "self" ? attacker : defender;
          this.applyStatus(target, move.effect.condition);
        }
        // Example: { "type": "stat", "stat": "defense", "stages": -1, "target": "enemy" }
        else if (move.effect.type === "stat") {
          const target = move.effect.target === "self" ? attacker : defender;
          this.applyStatChange(target, move.effect.stat, move.effect.stages);
        }
      } else {
        this.onLog(`It had no effect!`);
      }
      return;
    }

    // 3. Critical Hit Check
    const critChance = 0.0625;
    const isCrit = Math.random() < critChance;

    // 4. Damage Calculation using MODIFIED stats
    const levelFactor = (2 * attacker.level / 5) + 2;
    
    const atkStat = move.category === "special" ? this.getModifiedStat(attacker, 'spAtk') : this.getModifiedStat(attacker, 'attack');
    const defStat = move.category === "special" ? this.getModifiedStat(defender, 'spDef') : this.getModifiedStat(defender, 'defense');

    let baseDamage = ((levelFactor * move.power * (atkStat / defStat)) / 50) + 2;

    // 5. Modifiers
    let stabMultiplier = 1.0;
    if (attacker.types && attacker.types.includes(move.type)) {
      stabMultiplier = 1.5;
    }

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

    const critMultiplier = isCrit ? 1.5 : 1.0;
    const randomFactor = (Math.floor(Math.random() * 16) + 85) / 100;

    let finalDamage = Math.floor(baseDamage * stabMultiplier * typeMultiplier * critMultiplier * randomFactor);
    finalDamage = Math.max(1, finalDamage); 

    // Apply damage
    defender.hp = Math.max(0, defender.hp - finalDamage);

    // Logging
    if (typeMultiplier === 0) {
      this.onLog(`It had no effect on ${defender.species}!`);
      defender.hp += finalDamage; 
      return;
    }
    
    if (isCrit) this.onLog(`A critical hit!`);
    
    if (typeMultiplier > 1.0) this.onLog(`It's super effective!`);
    else if (typeMultiplier > 0 && typeMultiplier < 1.0) this.onLog(`It's not very effective...`);

    this.onLog(`${defender.species} took ${finalDamage} damage! (${defender.hp}/${defender.maxHp} HP)`);

    // Handle secondary effects (e.g., Ember has a 10% chance to burn)
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
      this.onLog(`Wild ${this.enemyMon.species} fainted! You win!`);
      this.isOver = true;
      return true;
    }
    if (this.playerMon.hp <= 0) {
      this.onLog(`${this.playerMon.species} fainted! You have no more usable Pokémon...`);
      this.isOver = true;
      return true;
    }
    return false;
  }
}

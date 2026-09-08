// js/battle.js
export class BattleEngine {
  constructor(playerMon, enemyMon, onLog, onVictory, onBlackout, onForceSwitch, typeChart = null, party) {
    this.playerMon = playerMon;
    this.enemyMon = enemyMon;
    this.onLog = onLog;
    this.onVictory = onVictory; 
    this.onBlackout = onBlackout;
    this.onForceSwitch = onForceSwitch;
    this.typeChart = typeChart;
    this.party = party;
    this.isOver = false;

    // Track all player Pokémon that entered battle for EXP sharing
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
    const multiplier = stage >= 0 ? (2 + stage) / 2 : 2 / (2 - Math.abs(stage));
    
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

checkWinLoss() { // Remove the parameter
    if (this.enemyMon.hp <= 0) {
      this.onLog(`Wild ${this.enemyMon.species} fainted! You win!`);
      this.isOver = true;
      if (this.onVictory) this.onVictory(Array.from(this.participants), this.enemyMon); 
      return true;
    }

    if (this.playerMon.hp <= 0) {
      this.onLog(`${this.playerMon.species} fainted!`);

      // Use this.party instead
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

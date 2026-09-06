// js/battle.js
export class BattleEngine {
  constructor(playerMon, enemyMon, onLog, typeChart = null) {
    this.playerMon = playerMon;
    this.enemyMon = enemyMon;
    this.onLog = onLog;
    this.typeChart = typeChart; // Pass your type_chart.json here if available
    this.isOver = false;
  }

  executeTurn(playerMove) {
    if (this.isOver) return;

    // 1. Determine turn order based on Speed stat
    const playerFirst = this.playerMon.speed >= this.enemyMon.speed;

    if (playerFirst) {
      this.processAction(this.playerMon, this.enemyMon, playerMove, true);
      if (this.checkWinLoss()) return;

      const enemyMove = this.getRandomEnemyMove();
      this.processAction(this.enemyMon, this.playerMon, enemyMove, false);
      if (this.checkWinLoss()) return;
    } else {
      const enemyMove = this.getRandomEnemyMove();
      this.processAction(this.enemyMon, this.playerMon, enemyMove, false);
      if (this.checkWinLoss()) return;

      this.processAction(this.playerMon, this.enemyMon, playerMove, true);
      if (this.checkWinLoss()) return;
    }
  }

  getRandomEnemyMove() {
    if (!this.enemyMon.moves || this.enemyMon.moves.length === 0) {
      // Fallback struggle-like move if out of moves
      return { name: "Tackle", type: "Normal", category: "physical", power: 35, accuracy: 100 };
    }
    const randomIndex = Math.floor(Math.random() * this.enemyMon.moves.length);
    return this.enemyMon.moves[randomIndex];
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

    // Handle Status Moves (power === 0)
    if (move.category === "status" || move.power === 0) {
      this.onLog(`It had no immediate effect!`);
      return;
    }

    // 3. Critical Hit Check (Standard ~6.25% chance)
    const critChance = 0.0625;
    const isCrit = Math.random() < critChance;

    // 4. Damage Calculation Formula (Simplified Gen 4 basis)
    const levelFactor = (2 * attacker.level / 5) + 2;
    
    // Choose Attack & Defense stats based on category
    const atkStat = move.category === "special" ? (attacker.stats?.spAtk || attacker.level * 5) : (attacker.stats?.attack || attacker.level * 5);
    const defStat = move.category === "special" ? (defender.stats?.spDef || defender.level * 5) : (defender.stats?.defense || defender.level * 5);

    let baseDamage = ((levelFactor * move.power * (atkStat / defStat)) / 50) + 2;

    // 5. Modifiers
    // STAB (Same-Type Attack Bonus) - 1.5x if move type matches attacker's type
    let stabMultiplier = 1.0;
    if (attacker.types && attacker.types.includes(move.type)) {
      stabMultiplier = 1.5;
    }

    // Type Effectiveness Multiplier
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

    // Critical Hit Multiplier (1.5x in modern gens)
    const critMultiplier = isCrit ? 1.5 : 1.0;

    // Random Factor (between 0.85 and 1.0)
    const randomFactor = (Math.floor(Math.random() * 16) + 85) / 100;

    // Final Damage calculation
    let finalDamage = Math.floor(baseDamage * stabMultiplier * typeMultiplier * critMultiplier * randomFactor);
    finalDamage = Math.max(1, finalDamage); // Always deal at least 1 damage if it hits

    // Apply damage to defender
    defender.hp = Math.max(0, defender.hp - finalDamage);

    // Log effectiveness / critical hits
    if (isCrit) {
      this.onLog(`A critical hit!`);
    }
    if (typeMultiplier > 1.0) {
      this.onLog(`It's super effective!`);
    } else if (typeMultiplier > 0 && typeMultiplier < 1.0) {
      this.onLog(`It's not very effective...`);
    } else if (typeMultiplier === 0) {
      this.onLog(`It had no effect on ${defender.species}!`);
      defender.hp += finalDamage; // Revert damage if immune
      return;
    }

    this.onLog(`${defender.species} took ${finalDamage} damage! (${defender.hp}/${defender.maxHp} HP)`);
  }

  checkWinLoss() {
    if (this.enemyMon.hp <= 0) {
      this.onLog(`Wild ${this.enemyMon.species} fainted! You win the battle!`);
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

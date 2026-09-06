// js/battle.js

export class BattleEngine {
  constructor(playerMon, enemyMon, logCallback) {
    this.player = playerMon;
    this.enemy = enemyMon;
    this.log = logCallback;
    this.isOver = false;
  }

  // Simplified Gen 1 Damage Calculation
  calculateDamage(attacker, defender, move) {
    const level = attacker.level;
    const power = move.power || 40;
    const attack = attacker.attack || 10;
    const defense = defender.defense || 10;
    
    // Formula: (((2 * Level / 5 + 2) * Power * (Atk / Def)) / 50) + 2
    const baseDamage = Math.floor((((2 * level / 5 + 2) * power * (attack / defense)) / 50) + 2);
    return Math.max(1, baseDamage);
  }

  executeTurn(playerMove) {
    if (this.isOver) return;

    // Pick a random move for the enemy
    const enemyMove = this.enemy.moves[Math.floor(Math.random() * this.enemy.moves.length)];

    // Speed check determines who attacks first
    const playerFirst = this.player.speed >= this.enemy.speed;
    const firstAttacker = playerFirst ? this.player : this.enemy;
    const firstDefender = playerFirst ? this.enemy : this.player;
    const firstMove = playerFirst ? playerMove : enemyMove;

    const secondAttacker = playerFirst ? this.enemy : this.player;
    const secondDefender = playerFirst ? this.player : this.enemy;
    const secondMove = playerFirst ? enemyMove : playerMove;

    // First attack
    this.processMove(firstAttacker, firstDefender, firstMove);
    if (firstDefender.hp <= 0) return this.endBattle(firstAttacker);

    // Second attack
    this.processMove(secondAttacker, secondDefender, secondMove);
    if (secondDefender.hp <= 0) return this.endBattle(secondAttacker);
  }

  processMove(attacker, defender, move) {
    const dmg = this.calculateDamage(attacker, defender, move);
    defender.hp = Math.max(0, defender.hp - dmg);
    this.log(`${attacker.species} used ${move.name}! (${dmg} DMG) -> ${defender.species}: ${defender.hp}/${defender.maxHp} HP`);
  }

  endBattle(winner) {
    this.isOver = true;
    this.log(`\n🏆 ${winner.species} won the battle!`);
  }
}

// js/battle.js

export class BattleEngine {
  constructor(playerMon, enemyMon, logCallback) {
    this.player = playerMon;
    this.enemy = enemyMon;
    this.log = logCallback;
    this.isOver = false;
  }

  // Gen 4 Damage Logic
calculateDamage(attacker, defender, move) {
  // Status moves deal zero direct damage
  if (move.category === "status" || move.power === 0) {
    return 0;
  }

  // 1. Select stats based on Physical/Special split
  let attackStat, defenseStat;

  if (move.category === "physical") {
    attackStat = attacker.stats.attack;
    defenseStat = defender.stats.defense;
  } else if (move.category === "special") {
    attackStat = attacker.stats.spAtk;
    defenseStat = defender.stats.spDef;
  }

  // 2. Base Gen 4 Formula
  const level = attacker.level;
  const power = move.power;
  
  const baseDamage = Math.floor(
    (((2 * level / 5 + 2) * power * (attackStat / defenseStat)) / 50) + 2
  );

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

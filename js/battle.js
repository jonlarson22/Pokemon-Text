// js/battle.js
export class BattleEngine {
constructor(playerMon, enemyParty, onLog, onVictory, onBlackout, onForceSwitch, typeChart = null, party, trainerName = "Wild", enemyItems = [], movesDb = null) {
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
    this.fled = false;
    this.weather = null;
    this.movesDb = movesDb;
    this.enemyItems = [...enemyItems];

    this.participants = new Set([this.playerMon]);

    this.setupBattleStats(this.playerMon);
    this.setupBattleStats(this.enemyMon);
  }

  freshVol() {
    return {
      confusion: 0, trapped: 0, protecting: false, endure: false,
      lockOn: false, mist: 0, safeguard: 0, reflect: 0, lightScreen: 0,
      aquaRing: false, identified: false, mudSport: false, waterSport: false,
      perish: 0, yawn: false, curse: false, destinyBond: false,
      focusEnergy: false, disabled: null, torment: false, taunt: 0,
      encore: null, imprison: null, grudge: false, snatch: false,
      bide: null
    };
  }

  setupBattleStats(mon) {
    mon.statStages = { attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0, accuracy: 0, evasion: 0 };
    mon.lastHit = null;
    mon.lastMove = null;
    mon.lastMoveData = null;
    mon.vol = this.freshVol();
    if (!mon.status) mon.status = null; 
    if (!mon.sleepTurns) mon.sleepTurns = 0;
    mon.seeded = false;
  }

  // Central damage application: handles Endure, Destiny Bond and Grudge triggers.
  dealDamage(target, amount, source) {
    let dmg = Math.max(0, Math.floor(amount));
    if (target.vol.endure && dmg >= target.hp && target.hp > 1) {
      dmg = target.hp - 1;
      target.vol.endure = false;
      this.onLog(`${target.species} endured the hit!`);
    }
    target.hp = Math.max(0, target.hp - dmg);
    if (target.vol && target.vol.bide) {
      target.vol.bide.damage += dmg;
    }
    if (target.hp <= 0) {
      if (target.vol.destinyBond) {
        target.vol.destinyBond = false;
        if (source && source.hp > 0) {
          source.hp = 0;
          this.onLog(`${source.species} was taken down with ${target.species}!`);
        }
      }
      if (target.vol.grudge && source && source.lastMoveData && source.lastMoveData.maxPp !== undefined) {
        source.lastMoveData.pp = 0;
        this.onLog(`${source.lastMoveData.name} lost all its PP to ${target.species}'s Grudge!`);
      }
    }
    return dmg;
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
    if (this.playerMon.vol.trapped > 0) {
      this.onLog(`${this.playerMon.species} is trapped and can't escape!`);
      return false;
    }

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
    // Priority brackets go first, then speed, then a coin flip (canon order).
    const actions = [
      { mon: this.playerMon, foe: this.enemyMon, move: playerMove, isPlayer: true },
      { mon: this.enemyMon, foe: this.playerMon, move: this.getRandomEnemyMove(), isPlayer: false },
    ];
    actions.sort((a, b) => {
      const pa = a.move.priority || 0, pb = b.move.priority || 0;
      if (pb !== pa) return pb - pa;
      const sa = this.getModifiedStat(a.mon, 'speed'), sb = this.getModifiedStat(b.mon, 'speed');
      if (sb !== sa) return sb - sa;
      return Math.random() < 0.5 ? -1 : 1;
    });

    for (const act of actions) {
      if (this.canMove(act.mon)) {
        this.processAction(act.mon, act.foe, act.move, act.isPlayer);
      }
      if (this.checkWinLoss()) return;
    }

    this.applyEndOfTurnEffects(this.playerMon, this.enemyMon);
    if (this.checkWinLoss()) return;

    this.applyEndOfTurnEffects(this.enemyMon, this.playerMon);
    if (this.checkWinLoss()) return;

    this.tickWeather();
    this.checkWinLoss();
  }

  getRandomEnemyMove() {
    const mon = this.enemyMon;
    if (!mon.moves || mon.moves.length === 0) {
      return { name: "Struggle", type: "Normal", category: "physical", power: 50, accuracy: 100 };
    }
    if (mon.vol.encore && mon.vol.encore.turns > 0 && mon.vol.encore.move) {
      return mon.vol.encore.move;
    }
    let pool = mon.moves;
    const foe = mon === this.enemyMon ? this.playerMon : this.enemyMon;
    if (mon.vol.disabled && mon.vol.disabled.turns > 0) {
      pool = pool.filter(m => m.name !== mon.vol.disabled.move);
    }
    if (mon.vol.taunt > 0) {
      pool = pool.filter(m => m.category !== "status");
    }
    if (mon.vol.torment && mon.lastMove) {
      pool = pool.filter(m => m.name !== mon.lastMove);
    }
    if (foe && foe.vol.imprison) {
      pool = pool.filter(m => !foe.vol.imprison.includes(m.name));
    }
    if (pool.length === 0) {
      return { name: "Struggle", type: "Normal", category: "physical", power: 50, accuracy: 100 };
    }
    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
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
    if (mon.vol.bide) {
      const b = mon.vol.bide;
      b.turns--;
      const foe = mon === this.playerMon ? this.enemyMon : this.playerMon;
      if (b.turns <= 0) {
        mon.vol.bide = null;
        this.onLog(`${mon.species} unleashed energy!`);
        if (foe && foe.hp > 0) {
          const dealt = this.dealDamage(foe, b.damage * 2, mon);
          this.onLog(`${foe.species} took ${dealt} damage! (${foe.hp}/${foe.maxHp} HP)`);
        } else {
          this.onLog(`But there was no target!`);
        }
        return false;
      }
      this.onLog(`${mon.species} is storing energy!`);
      return false;
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

    if (mon.vol.trapped > 0 && mon.hp > 0) {
      const dmg = Math.max(1, Math.floor(mon.maxHp / 16));
      mon.hp = Math.max(0, mon.hp - dmg);
      mon.vol.trapped--;
      this.onLog(`${mon.species} is hurt by the trap! (-${dmg} HP, ${mon.hp}/${mon.maxHp} HP)`);
      if (mon.vol.trapped <= 0) this.onLog(`${mon.species} was freed from the trap!`);
    }

    if (mon.vol.curse && mon.hp > 0) {
      const dmg = Math.max(1, Math.floor(mon.maxHp / 4));
      mon.hp = Math.max(0, mon.hp - dmg);
      this.onLog(`${mon.species} is afflicted by the curse! (-${dmg} HP, ${mon.hp}/${mon.maxHp} HP)`);
    }

    if (mon.vol.aquaRing && mon.hp > 0 && mon.hp < mon.maxHp) {
      const heal = Math.min(mon.maxHp - mon.hp, Math.max(1, Math.floor(mon.maxHp / 16)));
      mon.hp += heal;
      this.onLog(`${mon.species}'s Aqua Ring restored ${heal} HP! (${mon.hp}/${mon.maxHp} HP)`);
    }

    if (mon.vol.perish > 0 && mon.hp > 0) {
      mon.vol.perish--;
      if (mon.vol.perish <= 0) {
        mon.hp = 0;
        this.onLog(`${mon.species} fainted from Perish Song!`);
      } else {
        this.onLog(`${mon.species}'s Perish Song count fell to ${mon.vol.perish}!`);
      }
    }

    if (mon.vol.yawn && mon.hp > 0) {
      mon.vol.yawn = false;
      this.applyStatus(mon, 'SLP');
    }

    const timed = [["mist", "The mist faded!"], ["safeguard", "The Safeguard faded!"],
                   ["reflect", "The Reflect barrier faded!"], ["lightScreen", "The Light Screen faded!"],
                   ["taunt", "The taunt wore off!"]];
    for (const [key, msg] of timed) {
      if (mon.vol[key] > 0) {
        mon.vol[key]--;
        if (mon.vol[key] <= 0) this.onLog(`${mon.species}: ${msg}`);
      }
    }
    if (mon.vol.disabled && mon.vol.disabled.turns > 0) {
      mon.vol.disabled.turns--;
      if (mon.vol.disabled.turns <= 0) {
        this.onLog(`${mon.species} is no longer disabled!`);
        mon.vol.disabled = null;
      }
    }
    if (mon.vol.encore && mon.vol.encore.turns > 0) {
      mon.vol.encore.turns--;
      if (mon.vol.encore.turns <= 0) {
        this.onLog(`${mon.species}'s encore ended!`);
        mon.vol.encore = null;
      }
    }
    mon.vol.protecting = false;
    mon.vol.endure = false;
    mon.vol.snatch = false;
  }

  tickWeather() {
    if (!this.weather) return;
    for (const mon of [this.playerMon, this.enemyMon]) {
      if (!mon || mon.hp <= 0) continue;
      const types = mon.types || [];
      if (this.weather.type === "sand" && !types.some(t => ["Rock", "Ground", "Steel"].includes(t))) {
        const dmg = Math.max(1, Math.floor(mon.maxHp / 16));
        mon.hp = Math.max(0, mon.hp - dmg);
        this.onLog(`${mon.species} is buffeted by the sandstorm! (-${dmg} HP, ${mon.hp}/${mon.maxHp} HP)`);
      } else if (this.weather.type === "hail" && !types.includes("Ice")) {
        const dmg = Math.max(1, Math.floor(mon.maxHp / 16));
        mon.hp = Math.max(0, mon.hp - dmg);
        this.onLog(`${mon.species} is buffeted by the hail! (-${dmg} HP, ${mon.hp}/${mon.maxHp} HP)`);
      }
    }
    this.weather.turns--;
    if (this.weather.turns <= 0) {
      this.onLog(`The weather faded.`);
      this.weather = null;
    }
  }
  
  applyStatus(target, status) {
    if (target.status) return;
    if (target.vol.safeguard > 0) {
      this.onLog(`${target.species} is protected by Safeguard!`);
      return;
    }
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
    if (stages < 0 && target.vol.mist > 0) {
      this.onLog(`${target.species} is protected by Mist!`);
      return;
    }
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
  
  // Move types Snatch can steal: self-targeting boosts, heals and screens.
  // (Snatch itself is not stealable, which also bounds the redirect below.)
  isSnatchable(move) {
    if (!move || move.category !== "status") return false;
    const stealable = new Set(["stat", "heal", "rest", "protect", "endure",
      "reflect", "light_screen", "mist", "safeguard", "aqua_ring",
      "focus_energy", "belly_drum", "refresh", "aromatherapy"]);
    const effects = move.effect ? (Array.isArray(move.effect) ? move.effect : [move.effect]) : [];
    return effects.length > 0 &&
      effects.every(e => e.target === "self" && stealable.has(e.type));
  }

  processAction(attacker, defender, move, isPlayer) {
    if (attacker.hp <= 0) return;

    this.onLog(`${attacker.species} used ${move.name}!`);
    attacker.lastMove = move.name;
    attacker.lastMoveData = move;

    if (defender.vol.protecting) {
      defender.vol.protecting = false;
      this.onLog(`${defender.species} protected itself!`);
      return;
    }

    // Snatch: steal a snatchable self-targeting move. The snatch user becomes
    // the beneficiary, so re-run the move with the roles swapped and the
    // self-targeted effects land on the stealer instead of the foe.
    if (defender.vol.snatch && this.isSnatchable(move)) {
      defender.vol.snatch = false;
      this.onLog(`${defender.species} snatched ${move.name}!`);
      this.processAction(defender, attacker, move, !isPlayer);
      return;
    }

    if (attacker.vol.confusion > 0) {
      attacker.vol.confusion--;
      if (attacker.vol.confusion <= 0) {
        this.onLog(`${attacker.species} snapped out of its confusion!`);
      } else if (Math.random() < 0.5) {
        const atk = this.getModifiedStat(attacker, 'attack');
        const def = Math.max(1, this.getModifiedStat(attacker, 'defense'));
        const dmg = Math.max(1, Math.floor((((2 * attacker.level / 5 + 2) * 40 * (atk / def)) / 50) + 2));
        attacker.hp = Math.max(0, attacker.hp - dmg);
        this.onLog(`${attacker.species} is confused!`);
        this.onLog(`It hurt itself in its confusion! (${attacker.hp}/${attacker.maxHp} HP)`);
        return;
      }
    }

    if (move.accuracy && !attacker.vol.lockOn) {
      const accStage = attacker.statStages.accuracy || 0;
      const evaStage = defender.statStages.evasion || 0;
      const netStage = Math.max(-6, Math.min(6, accStage - evaStage));
      const multiplier = netStage >= 0 ? (3 + netStage) / 3 : 3 / (3 + Math.abs(netStage));
      const finalAccuracy = move.accuracy * multiplier;

      if (Math.random() * 100 > finalAccuracy) {
        this.onLog(`${attacker.species}'s attack missed!`);
        return;
      }
    } else if (attacker.vol.lockOn) {
      attacker.vol.lockOn = false;
    }

    if (move.ohko) {
      if (attacker.level < defender.level) {
        this.onLog(`But it failed!`);
        return;
      }
      this.dealDamage(defender, defender.hp, attacker);
      defender.lastHit = { damage: defender.maxHp, category: move.category };
      if (defender.hp <= 0) this.onLog(`It's a one-hit KO!`);
      return;
    }

    if (move.fixed) {
      let fixedDamage = 0;
      if (move.fixed.kind === "level") fixedDamage = attacker.level;
      else if (move.fixed.kind === "value") fixedDamage = move.fixed.value;
      else if (move.fixed.kind === "half") fixedDamage = Math.max(1, Math.floor(defender.hp / 2));
      else if (move.fixed.kind === "level_random") fixedDamage = Math.floor(attacker.level * (Math.random() + 0.5));

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
      const dealtFixed = this.dealDamage(defender, fixedDamage, attacker);
      defender.lastHit = { damage: dealtFixed, category: move.category };
      this.onLog(`${defender.species} took ${dealtFixed} damage! (${defender.hp}/${defender.maxHp} HP)`);
      return;
    }

    if (move.counter) {
      const last = attacker.lastHit;
      if (!last || last.category !== move.counter) {
        this.onLog(`But it failed!`);
        return;
      }
      const counterDamage = last.damage * 2;
      const dealtCounter = this.dealDamage(defender, counterDamage, attacker);
      this.onLog(`${defender.species} took ${dealtCounter} damage! (${defender.hp}/${defender.maxHp} HP)`);
      return;
    }

    if (move.powerScale === "endeavor") {
      if (attacker.hp >= defender.hp) {
        this.onLog(`But it failed!`);
        return;
      }
      const endDmg = this.dealDamage(defender, defender.hp - attacker.hp, attacker);
      defender.lastHit = { damage: endDmg, category: move.category };
      this.onLog(`${defender.species} took ${endDmg} damage! (${defender.hp}/${defender.maxHp} HP)`);
      return;
    }

    if (move.powerScale === "psywave") {
      const psyDmg = 1 + Math.floor(Math.random() * Math.max(1, Math.floor(attacker.level * 1.5)));
      const dealtPsy = this.dealDamage(defender, psyDmg, attacker);
      defender.lastHit = { damage: dealtPsy, category: move.category };
      this.onLog(`A wave of psychic energy hit ${defender.species}!`);
      this.onLog(`${defender.species} took ${dealtPsy} damage! (${defender.hp}/${defender.maxHp} HP)`);
      return;
    }

    if (move.category === "status" || (move.power === 0 && !move.powerScale)) {
      const effects = move.effect ? (Array.isArray(move.effect) ? move.effect : [move.effect]) : [];
      if (effects.length === 0) {
        this.onLog(`It had no effect!`);
        return;
      }
      for (const effect of effects) {
        const target = effect.target === "self" ? attacker : defender;
        if (effect.type === "leech_seed") {
          if (target.seeded) {
            this.onLog(`${target.species} is already seeded!`);
          } else {
            target.seeded = true;
            this.onLog(`${target.species} was seeded!`);
          }
        } else if (effect.type === "status") {
          this.applyStatus(target, effect.condition);
        } else if (effect.type === "stat") {
          this.applyStatChange(target, effect.stat, effect.stages);
        } else if (effect.type === "heal") {
          const amount = Math.min(target.maxHp - target.hp, Math.max(1, Math.floor(target.maxHp * effect.value)));
          if (amount > 0) {
            target.hp += amount;
            this.onLog(`${target.species} recovered ${amount} HP!`);
          } else {
            this.onLog(`${target.species} is already at full health!`);
          }
        } else if (effect.type === "rest") {
          target.status = null;
          target.hp = target.maxHp;
          target.sleepTurns = 2;
          target.status = "SLP";
          this.onLog(`${target.species} fell asleep and recovered all its HP!`);
        } else if (effect.type === "bide") {
          target.vol.bide = { turns: 2, damage: 0 };
          this.onLog(`${target.species} is storing energy!`);
        } else if (effect.type === "protect") {
          target.vol.protecting = true;
          this.onLog(`${target.species} protected itself!`);
        } else if (effect.type === "endure") {
          target.vol.endure = true;
          this.onLog(`${target.species} braced itself!`);
        } else if (effect.type === "snatch") {
          target.vol.snatch = true;
          this.onLog(`${target.species} is waiting to snatch the foe's move!`);
        } else if (effect.type === "lock_on") {
          target.vol.lockOn = true;
          this.onLog(`${target.species} took aim at ${defender.species}!`);
        } else if (effect.type === "mist") {
          target.vol.mist = 5;
          this.onLog(`${target.species} became shrouded in mist!`);
        } else if (effect.type === "safeguard") {
          target.vol.safeguard = 5;
          this.onLog(`${target.species} became protected by Safeguard!`);
        } else if (effect.type === "reflect") {
          target.vol.reflect = 5;
          this.onLog(`${target.species} raised a Reflect barrier!`);
        } else if (effect.type === "light_screen") {
          target.vol.lightScreen = 5;
          this.onLog(`${target.species} raised a Light Screen barrier!`);
        } else if (effect.type === "weather") {
          this.weather = { type: effect.weather, turns: 5 };
          const wname = { sun: "harsh sunlight", rain: "rain", sand: "a sandstorm", hail: "hail" }[effect.weather];
          this.onLog(`The weather changed to ${wname}!`);
        } else if (effect.type === "haze") {
          const zero = { attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0, accuracy: 0, evasion: 0 };
          attacker.statStages = { ...zero };
          defender.statStages = { ...zero };
          this.onLog(`All stat changes were eliminated!`);
        } else if (effect.type === "belly_drum") {
          if (target.hp <= Math.floor(target.maxHp / 2)) {
            this.onLog(`But it failed!`);
          } else {
            target.hp -= Math.floor(target.maxHp / 2);
            target.statStages.attack = 6;
            this.onLog(`${target.species} cut its own HP and maximized its attack! (${target.hp}/${target.maxHp} HP)`);
          }
        } else if (effect.type === "curse") {
          if (target.types && target.types.includes("Ghost")) {
            defender.vol.curse = true;
            this.onLog(`${target.species} laid a curse on ${defender.species}!`);
          } else {
            this.applyStatChange(target, "speed", -1);
            this.applyStatChange(target, "attack", 1);
            this.applyStatChange(target, "defense", 1);
          }
        } else if (effect.type === "yawn") {
          target.vol.yawn = true;
          this.onLog(`${target.species} grew drowsy!`);
        } else if (effect.type === "psych_up") {
          target.statStages = { ...defender.statStages };
          this.onLog(`${target.species} copied ${defender.species}'s stat changes!`);
        } else if (effect.type === "aromatherapy") {
          const side = isPlayer ? this.party : this.enemyParty;
          (side || []).forEach(m => { if (m.hp > 0) m.status = null; });
          this.onLog(`A soothing aroma cured all status problems!`);
        } else if (effect.type === "refresh") {
          target.status = null;
          this.onLog(`${target.species} was refreshed!`);
        } else if (effect.type === "aqua_ring") {
          target.vol.aquaRing = true;
          this.onLog(`${target.species} surrounded itself with a veil of water!`);
        } else if (effect.type === "perish_song") {
          attacker.vol.perish = 3;
          defender.vol.perish = 3;
          this.onLog(`Both Pokémon will faint in 3 turns!`);
        } else if (effect.type === "destiny_bond") {
          target.vol.destinyBond = true;
          this.onLog(`${target.species} is trying to take its foe down with it!`);
        } else if (effect.type === "foresight") {
          target.vol.identified = true;
          this.onLog(`${target.species} was identified!`);
        } else if (effect.type === "mud_sport") {
          target.vol.mudSport = true;
          this.onLog(`Electricity was weakened by mud!`);
        } else if (effect.type === "water_sport") {
          target.vol.waterSport = true;
          this.onLog(`Fire was weakened by water!`);
        } else if (effect.type === "focus_energy") {
          target.vol.focusEnergy = true;
          this.onLog(`${target.species} is getting pumped!`);
        } else if (effect.type === "grudge") {
          target.vol.grudge = true;
          this.onLog(`${target.species} bears a grudge!`);
        } else if (effect.type === "force_flee") {
          if (this.trainerName === "Wild") {
            this.onLog(`Got away safely!`);
            this.fled = true;
            this.isOver = true;
          } else {
            this.onLog(`But it failed!`);
          }
        } else if (effect.type === "confusion") {
          if (target.vol.confusion === 0) {
            target.vol.confusion = Math.floor(Math.random() * 4) + 2;
            this.onLog(`${target.species} became confused!`);
          }
        } else if (effect.type === "trap") {
          if (target.vol.trapped === 0) {
            target.vol.trapped = Math.floor(Math.random() * 4) + 2;
            this.onLog(`${target.species} was trapped!`);
          } else {
            this.onLog(`${target.species} is already trapped!`);
          }
        } else if (effect.type === "disable") {
          if (!target.lastMove) {
            this.onLog(`But it failed!`);
          } else {
            target.vol.disabled = { move: target.lastMove, turns: 4 };
            this.onLog(`${target.species}'s ${target.lastMove} was disabled!`);
          }
        } else if (effect.type === "torment") {
          target.vol.torment = true;
          this.onLog(`${target.species} was tormented!`);
        } else if (effect.type === "taunt") {
          target.vol.taunt = 3;
          this.onLog(`${target.species} was taunted!`);
        } else if (effect.type === "encore") {
          const last = target.lastMoveData;
          if (!last || ["Encore", "Mimic", "Mirror Move", "Metronome", "Transform", "Struggle"].includes(last.name)) {
            this.onLog(`But it failed!`);
          } else {
            target.vol.encore = { move: last, turns: 3 };
            this.onLog(`${target.species} received an encore!`);
          }
        } else if (effect.type === "imprison") {
          target.vol.imprison = (attacker.moves || []).map(m => m.name);
          this.onLog(`${target.species} sealed its foe's moves!`);
        } else if (effect.type === "spite") {
          const lm = target.lastMoveData;
          if (lm && lm.maxPp !== undefined) {
            lm.pp = Math.max(0, lm.pp - 4);
            this.onLog(`${target.species}'s ${lm.name} lost 4 PP!`);
          } else {
            this.onLog(`But it failed!`);
          }
        } else if (effect.type === "mimic") {
          const last = defender.lastMoveData;
          if (!last || ["Mimic", "Mirror Move", "Metronome", "Transform", "Struggle"].includes(last.name)) {
            this.onLog(`But it failed!`);
          } else {
            const idx = attacker.moves.findIndex(m => m.name === move.name);
            attacker.moves[idx] = { ...last, maxPp: 5, pp: 5 };
            this.onLog(`${attacker.species} learned ${last.name} via Mimic!`);
          }
        } else if (effect.type === "mirror_move") {
          const last = defender.lastMoveData;
          if (!last || ["Mimic", "Mirror Move", "Metronome", "Transform", "Struggle"].includes(last.name)) {
            this.onLog(`But it failed!`);
          } else {
            this.processAction(attacker, defender, { ...last }, isPlayer);
          }
        } else if (effect.type === "metronome") {
          if (!this.movesDb) {
            this.onLog(`But it failed!`);
          } else {
            const banned = ["Metronome", "Mimic", "Mirror Move", "Transform", "Struggle"];
            const pool = Object.values(this.movesDb).filter(m => m && !banned.includes(m.name));
            if (pool.length === 0) {
              this.onLog(`But it failed!`);
            } else {
              const pick = pool[Math.floor(Math.random() * pool.length)];
              this.onLog(`${attacker.species} used ${pick.name} via Metronome!`);
              this.processAction(attacker, defender, { ...pick }, isPlayer);
            }
          }
        } else if (effect.type === "transform") {
          attacker.types = [...(defender.types || [])];
          if (defender.stats) attacker.stats = { ...defender.stats };
          else { attacker.attack = defender.attack; attacker.defense = defender.defense; attacker.spAtk = defender.spAtk; attacker.spDef = defender.spDef; attacker.speed = defender.speed; }
          attacker.moves = (defender.moves || []).map(m => ({ ...m, maxPp: 5, pp: 5 }));
          attacker.statStages = { attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0, accuracy: 0, evasion: 0 };
          attacker.vol = this.freshVol();
          const newSpecies = defender.species;
          this.onLog(`${attacker.species} transformed into ${newSpecies}!`);
          attacker.species = newSpecies;
        }
      }
      return;
    }

    let power = move.power;
    if (move.powerScale === "flail") {
      const ratio = attacker.hp / attacker.maxHp;
      power = ratio > 2/3 ? 20 : ratio > 1/3 ? 40 : ratio > 1/6 ? 80 : ratio > 1/12 ? 100 : ratio > 1/24 ? 150 : 200;
    } else if (move.powerScale === "magnitude") {
      power = [10, 30, 50, 70, 90, 110, 150][Math.floor(Math.random() * 7)];
    } else if (move.powerScale === "lowkick") {
      power = 60;
    } else if (move.powerScale === "return") {
      const f = attacker.friendship ?? 70;
      power = Math.min(102, Math.max(1, Math.floor(f / 2.5)));
    } else if (move.powerScale === "frustration") {
      const f = attacker.friendship ?? 70;
      power = Math.min(102, Math.max(1, Math.floor((255 - f) / 2.5)));
    }

    const isCrit = Math.random() < (attacker.vol.focusEnergy ? 0.25 : 0.0625);
    const levelFactor = (2 * attacker.level / 5) + 2;
    const atkStat = move.category === "special" ? this.getModifiedStat(attacker, 'spAtk') : this.getModifiedStat(attacker, 'attack');
    const defStat = move.category === "special" ? this.getModifiedStat(defender, 'spDef') : this.getModifiedStat(defender, 'defense');

    let baseDamage = ((levelFactor * power * (atkStat / defStat)) / 50) + 2;

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

    if (typeMultiplier === 0 && defender.vol.identified) typeMultiplier = 1;

    if (typeMultiplier === 0) {
      this.onLog(`It had no effect on ${defender.species}!`);
      return; 
    }

    let weatherMultiplier = 1.0;
    if (this.weather) {
      if (this.weather.type === "sun") {
        if (move.type === "Fire") weatherMultiplier = 1.5;
        else if (move.type === "Water") weatherMultiplier = 0.5;
      } else if (this.weather.type === "rain") {
        if (move.type === "Water") weatherMultiplier = 1.5;
        else if (move.type === "Fire") weatherMultiplier = 0.5;
      }
    }

    let screenMultiplier = 1.0;
    if (move.category === "physical" && defender.vol.reflect > 0) screenMultiplier = 0.5;
    if (move.category === "special" && defender.vol.lightScreen > 0) screenMultiplier = 0.5;

    let sportMultiplier = 1.0;
    if (move.type === "Electric" && (attacker.vol.mudSport || defender.vol.mudSport)) sportMultiplier = 0.5;
    if (move.type === "Fire" && (attacker.vol.waterSport || defender.vol.waterSport)) sportMultiplier = 0.5;

    const critMultiplier = isCrit ? 1.5 : 1.0;
    const randomFactor = (Math.floor(Math.random() * 16) + 85) / 100;

    let finalDamage = Math.floor(baseDamage * stabMultiplier * typeMultiplier * critMultiplier * randomFactor * weatherMultiplier * screenMultiplier * sportMultiplier);
    finalDamage = Math.max(1, finalDamage); 

    const dealt = this.dealDamage(defender, finalDamage, attacker);
    defender.lastHit = { damage: dealt, category: move.category };

    if (isCrit) this.onLog(`A critical hit!`);
    if (typeMultiplier > 1.0) this.onLog(`It's super effective!`);
    else if (typeMultiplier < 1.0) this.onLog(`It's not very effective...`);

    this.onLog(`${defender.species} took ${dealt} damage! (${defender.hp}/${defender.maxHp} HP)`);
    
    if (move.name === "Struggle") {
      const recoil = Math.max(1, Math.floor(attacker.maxHp / 4));
      attacker.hp = Math.max(0, attacker.hp - recoil);
      this.onLog(`${attacker.species} is hit with recoil! (${attacker.hp}/${attacker.maxHp} HP)`);
    }

    if (move.effect?.type === "recoil") {
      const r = Math.max(1, Math.floor(dealt * move.effect.value));
      attacker.hp = Math.max(0, attacker.hp - r);
      this.onLog(`${attacker.species} is hit with recoil! (${attacker.hp}/${attacker.maxHp} HP)`);
    }
      
    if (move.drain || move.effect?.type === "drain") {
      const drainRatio = move.drain || 0.5;
      const recovered = Math.min(attacker.maxHp - attacker.hp, Math.max(1, Math.floor(dealt * drainRatio)));
      if (recovered > 0) {
        attacker.hp += recovered;
        this.onLog(`${attacker.species} drained health and recovered ${recovered} HP!`);
      }
    }

    this.applySecondaryEffects(attacker, defender, move);
  }

  applySecondaryEffects(attacker, defender, move) {
    if (!move.secondaryEffect) return;
    const secondaries = Array.isArray(move.secondaryEffect) ? move.secondaryEffect : [move.secondaryEffect];
    for (const se of secondaries) {
      const chance = se.chance || 100;
      if (Math.random() * 100 > chance) continue;
      const target = se.target === "self" ? attacker : defender;
      if (se.type === "status") {
        this.applyStatus(target, se.condition);
      } else if (se.type === "stat") {
        this.applyStatChange(target, se.stat, se.stages);
      } else if (se.type === "confusion") {
        if (target.vol.confusion === 0) {
          target.vol.confusion = Math.floor(Math.random() * 4) + 2;
          this.onLog(`${target.species} became confused!`);
        }
      } else if (se.type === "trap") {
        if (target.vol.trapped === 0) {
          target.vol.trapped = Math.floor(Math.random() * 4) + 2;
          this.onLog(`${target.species} was trapped!`);
        }
      } else if (se.type === "random_status") {
        const cond = se.conditions[Math.floor(Math.random() * se.conditions.length)];
        this.applyStatus(target, cond);
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
      // Fainting strains the bond: -2 friendship (floor 0).
      this.playerMon.friendship = Math.max(0, (this.playerMon.friendship ?? 70) - 2);
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

    const battle = this.game.gameState.activeBattle;
    const pmon = battle.playerMon;
    const foe = battle.enemyMon;

    if (pmon.vol.encore && pmon.vol.encore.turns > 0 && pmon.vol.encore.move) {
      playerMove = pmon.vol.encore.move;
      this.game.ui.printToLog(`${pmon.species} is encored into ${playerMove.name}!`);
    } else {
      if (pmon.vol.disabled && pmon.vol.disabled.turns > 0 && playerMove.name === pmon.vol.disabled.move) {
        this.game.ui.printToLog(`${pmon.species}'s ${playerMove.name} is disabled!`);
        return;
      }
      if (pmon.vol.taunt > 0 && playerMove.category === "status") {
        this.game.ui.printToLog(`${pmon.species} can't use status moves while taunted!`);
        return;
      }
      if (pmon.vol.torment && pmon.lastMove && playerMove.name === pmon.lastMove) {
        this.game.ui.printToLog(`${pmon.species} is tormented and can't use ${playerMove.name} twice in a row!`);
        return;
      }
      if (foe && foe.vol.imprison && foe.vol.imprison.includes(playerMove.name)) {
        this.game.ui.printToLog(`${playerMove.name} was sealed by Imprison!`);
        return;
      }
    }

    // Check if the player has no moves with PP left
    const allOutOfPP = pmon.moves.every(m => m.pp === 0);
    
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

    if (this.game.gameState.activeBattle && this.game.gameState.activeBattle.fled) {
      this.game.ui.printToLog("You got away safely!");
      this.finishBattleCleanup();
      return;
    }

    if (this.game.gameState.activeBattle && this.game.gameState.activeTrainer) {
      const trainer = this.game.gameState.activeTrainer;

      if (trainer.dialogueAfter) {
        this.game.ui.printToLog(`${trainer.name}: "${trainer.dialogueAfter}"`);
      }

      const payout = trainer.rewardMoney ?? trainer.payout ?? 500;
      this.game.gameState.money += payout;
      this.game.ui.printToLog(`You defeated ${trainer.name} and got ¥${payout}!`);
      
      // Update the defeated status AND set the global flag for route gating
      this.game.gameState.defeatedTrainers[this.game.gameState.activeTrainerId] = true;
      this.game.setFlag(`defeated_${this.game.gameState.activeTrainerId}`, true);

      // Gym leaders clear their gym: skipped trainers can't be battled later
      if (trainer.clearsRouteTrainers) {
        const routeData = this.game.db.routes[this.game.gameState.currentRoute];
        if (routeData && routeData.trainers) {
          routeData.trainers.forEach(tid => {
            this.game.gameState.defeatedTrainers[tid] = true;
            this.game.setFlag(`defeated_${tid}`, true);
          });
          this.game.ui.printToLog(`The gym's remaining trainers concede defeat!`);
        }
      }
      
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
          this.game.interactions.giveItem(reward.id, reward.qty || reward.quantity || 1);
          break;
        case "pokemon_choice":
          requiresChoice = true;
          this.promptPokemonChoice(reward.choices);
          break;
        case "pokemon":
          {
            const newMon = this.game.factory.generatePokemonInstance(reward.species, reward.level || 5);
            if (newMon) {
              if (this.game.gameState.party.length < 6) {
                this.game.gameState.party.push(newMon);
                this.game.ui.printToLog(`Added ${newMon.species} to your party!`);
              } else {
                if (!this.game.gameState.pc) this.game.gameState.pc = [];
                this.game.gameState.pc.push(newMon);
                this.game.ui.printToLog(`Sent ${newMon.species} to the PC!`);
              }
              this.game.ui.updatePartyUI();
            }
          }
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

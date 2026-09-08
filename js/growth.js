// js/growth.js
export class GrowthEngine {
  constructor(game) {
    this.game = game;
  }

  awardExp(participants, defeatedMon) {
    const participantList = Array.isArray(participants) ? participants : [participants];
    const livingParticipants = participantList.filter(mon => mon.hp > 0);
    
    if (livingParticipants.length === 0) return;

    const baseData = this.game.db.pokemon[defeatedMon.id];
    const baseExp = baseData ? baseData.baseExp : 50; 
    
    const totalExpGained = Math.floor((baseExp * defeatedMon.level) / 7);
    const expPerMon = Math.max(1, Math.floor(totalExpGained / livingParticipants.length));

    livingParticipants.forEach(mon => {
      this.game.ui.printToLog(`${mon.species} gained ${expPerMon} EXP!`);
      mon.exp += expPerMon;
      this.checkLevelUp(mon);
    });
  }

checkLevelUp(mon) {
  const baseData = this.game.db.pokemon[mon.id];
  let leveledUp = false;

  while (mon.exp >= mon.maxExp) {
    mon.level++;
    mon.maxExp = this.getRequiredExp(baseData.growthRate || 'medium_fast', mon.level + 1);
    leveledUp = true;

    this.recalculateStats(mon);
    this.game.ui.printToLog(`${mon.species} grew to Lv. ${mon.level}!`);
    this.checkLearnset(mon);
  }

  if (leveledUp) {
    this.game.ui.updatePartyUI();
    this.checkEvolution(mon, 'level');
  }
}

checkEvolution(mon, method, itemUsed = null) {
  const baseData = this.game.db.pokemon[mon.id];
  if (!baseData || !baseData.evolution) return;

  const evo = baseData.evolution;
  let canEvolve = false;

  if (method === 'level' && evo.method === 'level' && mon.level >= evo.level) {
    canEvolve = true;
  } else if (method === 'item' && evo.method === 'item' && itemUsed === evo.item) {
    canEvolve = true;
  }

  if (canEvolve) {
    this.promptEvolution(mon, evo.target);
  }
}

promptEvolution(mon, targetSpeciesId) {
  const targetData = this.game.db.pokemon[targetSpeciesId];
  if (!targetData) return;

  this.game.ui.printToLog(`What? ${mon.species} is evolving!`);
  this.game.ui.setMenuState('dynamic');

  const content = document.getElementById('dynamic-content');
  const controls = document.getElementById('dynamic-controls');
  content.innerHTML = `<p style="text-align:center;">${mon.species} is evolving into ${targetData.name}!</p>`;
  controls.innerHTML = '';

  this.game.ui.buildMenuControls(controls, [
    {
      text: "Let it Evolve!",
      action: () => {
        const oldName = mon.species;
        mon.id = targetData.id;
        mon.species = targetData.name;
        mon.types = targetData.types;
        
        this.recalculateStats(mon);
        this.game.ui.printToLog(`Congratulations! Your ${oldName} evolved into ${mon.species}!`);
        this.checkLearnset(mon);
        this.game.ui.updatePartyUI();
        this.game.ui.setMenuState('route');
      }
    },
    {
      text: "Cancel (Press B)",
      action: () => {
        this.game.ui.printToLog(`Huh? ${mon.species} stopped evolving!`);
        this.game.ui.setMenuState('route');
      }
    }
  ]);
}

  recalculateStats(mon) {
    const baseData = this.game.db.pokemon[mon.id];
    if (!baseData) return;
    
    const oldMaxHp = mon.maxHp;

    const calcStat = (base, iv, lvl, isHP) => {
      if (isHP) return Math.floor(((2 * base + iv) * lvl) / 100) + lvl + 10;
      return Math.floor(((2 * base + iv) * lvl) / 100) + 5;
    };

    mon.maxHp = calcStat(baseData.baseStats.hp, mon.ivs.hp, mon.level, true);
    mon.hp += (mon.maxHp - oldMaxHp); 

    mon.speed = calcStat(baseData.baseStats.speed, mon.ivs.speed, mon.level, false);
    mon.stats.attack = calcStat(baseData.baseStats.attack, mon.ivs.attack, mon.level, false);
    mon.stats.defense = calcStat(baseData.baseStats.defense, mon.ivs.defense, mon.level, false);
    mon.stats.spAtk = calcStat(baseData.baseStats.spAtk, mon.ivs.spAtk, mon.level, false);
    mon.stats.spDef = calcStat(baseData.baseStats.spDef, mon.ivs.spDef, mon.level, false);
  }

    getRequiredExp(growthRate, level) {
      const n = level;
      switch (growthRate) {
        case 'fast':
          return Math.floor((4 * Math.pow(n, 3)) / 5);
        case 'medium_fast':
          return Math.pow(n, 3);
        case 'medium_slow':
          return Math.floor(1.2 * Math.pow(n, 3) - 15 * Math.pow(n, 2) + 100 * n - 140);
        case 'slow':
          return Math.floor((5 * Math.pow(n, 3)) / 4);
        default:
          return Math.pow(n, 3);
      }
    }
  
  checkLearnset(mon) {
    const baseData = this.game.db.pokemon[mon.id];
    if (!baseData || !baseData.learnset) return;

    const newMoves = baseData.learnset.filter(entry => entry.level === mon.level);
    
    newMoves.forEach(moveEntry => {
      const moveData = this.game.db.moves[moveEntry.move];
      if (!moveData) return;

      const alreadyKnows = mon.moves.some(m => m.name === moveData.name);
      if (alreadyKnows) return;

      if (mon.moves.length < 4) {
        mon.moves.push(moveData);
        this.game.ui.printToLog(`${mon.species} learned ${moveData.name}!`);
      } else {
        this.promptMoveReplacement(mon, moveData);
      }
    });
  }

  promptMoveReplacement(mon, newMove) {
    this.game.ui.printToLog(`${mon.species} is trying to learn ${newMove.name}...`);
    this.game.ui.printToLog(`But ${mon.species} can only know 4 moves!`);
    
    this.game.ui.setMenuState('dynamic');
    const content = document.getElementById('dynamic-content');
    const controls = document.getElementById('dynamic-controls');
    content.innerHTML = '<p style="text-align:center;">Select a move to forget:</p>';
    controls.innerHTML = '';

    mon.moves.forEach((currentMove, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `Forget ${currentMove.name}`;
      btn.onclick = () => {
        const oldMoveName = currentMove.name;
        mon.moves[index] = newMove;
        this.game.ui.printToLog(`1, 2, and... Poof! ${mon.species} forgot ${oldMoveName} and learned ${newMove.name}!`);
        this.game.ui.setMenuState('route');
      };
      content.appendChild(btn);
    });

    this.game.ui.buildMenuControls(controls, [
      { 
        text: "Keep Old Moves", 
        action: () => {
          this.game.ui.printToLog(`${mon.species} gave up on learning ${newMove.name}.`);
          this.game.ui.setMenuState('route');
        } 
      }
    ]);
  }
}

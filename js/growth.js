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
    let leveledUp = false;
    
    while (mon.exp >= mon.maxExp) {
      mon.level++;
      mon.maxExp = Math.pow(mon.level + 1, 3);
      leveledUp = true;
      
      this.recalculateStats(mon);
      this.game.ui.printToLog(`${mon.species} grew to Lv. ${mon.level}!`);
      this.checkLearnset(mon);
    }

    if (leveledUp) {
      this.game.ui.updatePartyUI();
    }
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

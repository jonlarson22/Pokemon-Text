// pokemon_factory.js

export class PokemonFactory {
  constructor(engine) {
    this.engine = engine;
  }

  generatePokemonInstance(speciesId, level) {
    const safeId = speciesId.toLowerCase(); 
    const baseData = this.engine.db.pokemon[safeId];
    
    if (!baseData) {
      console.error(`Missing data for species: ${speciesId}`);
      return null;
    }

    // Generate Individual Values (IVs) between 0 and 31
    const ivs = {
      hp: Math.floor(Math.random() * 32),
      attack: Math.floor(Math.random() * 32),
      defense: Math.floor(Math.random() * 32),
      spAtk: Math.floor(Math.random() * 32),
      spDef: Math.floor(Math.random() * 32),
      speed: Math.floor(Math.random() * 32)
    };

    const calcStat = (base, iv, lvl, isHP) => {
      if (isHP) return Math.floor(((2 * base + iv) * lvl) / 100) + lvl + 10;
      return Math.floor(((2 * base + iv) * lvl) / 100) + 5;
    };

    const hp = calcStat(baseData.baseStats.hp, ivs.hp, level, true);

    // NEW: Calculate correct EXP using formulas from the growth chart
    const growth = baseData.growthRate || 'medium_fast';
    const getExp = (lvl) => {
      if (lvl <= 1) return 0;
      switch (growth) {
        case 'fast': return Math.floor((4 * Math.pow(lvl, 3)) / 5);
        case 'medium_slow': return Math.floor((1.2 * Math.pow(lvl, 3)) - (15 * Math.pow(lvl, 2)) + (100 * lvl) - 140);
        case 'slow': return Math.floor((5 * Math.pow(lvl, 3)) / 4);
        case 'medium_fast': default: return Math.pow(lvl, 3);
      }
    };

    const startExp = getExp(level);
    const nextExp = getExp(level + 1);
    
    return {
      species: baseData.name,
      id: safeId,
      types: baseData.types,
      level: level,
      hp: hp,
      maxHp: hp,
      ivs: ivs,
      speed: calcStat(baseData.baseStats.speed, ivs.speed, level, false),
      stats: {
        attack: calcStat(baseData.baseStats.attack, ivs.attack, level, false),
        defense: calcStat(baseData.baseStats.defense, ivs.defense, level, false),
        spAtk: calcStat(baseData.baseStats.spAtk, ivs.spAtk, level, false),
        spDef: calcStat(baseData.baseStats.spDef, ivs.spDef, level, false),
      },
      
      // NEW: Clone the move object to avoid mutating the main database and inject PP
      moves: (() => {
        let selectedMoves = [];

        // Check if the database has a level-based learnset array
        if (baseData.learnset) {
          const availableMoves = baseData.learnset
            .filter(learnInfo => learnInfo.level <= level)
            .map(learnInfo => learnInfo.move);
          
          selectedMoves = availableMoves.slice(-4); 
        } 
        // Fallback to grabbing the first 4 standard moves if learnset doesn't exist
        else if (baseData.moves) {
          selectedMoves = baseData.moves.slice(0, 4);
        }

        // Clone move object and inject PP tracking
        let resolved = selectedMoves.map(moveId => {
          const moveDef = this.engine.db.moves[moveId];
          if (!moveDef) return null;
          return {
            ...moveDef,
            maxPp: moveDef.pp,
            pp: moveDef.pp
          };
        }).filter(Boolean);

        // Safety net: never send a Pokemon into battle with zero moves.
        // Falls back to Tackle until moves.json is fully built out.
        if (resolved.length === 0 && this.engine.db.moves['tackle']) {
          const t = this.engine.db.moves['tackle'];
          resolved = [{ ...t, maxPp: t.pp, pp: t.pp }];
        }
        return resolved;
      })(),
      
      // NEW: Apply accurate EXP values
      exp: startExp,
      maxExp: nextExp,
      // Bond with the trainer: 0-255, starts at 70 (gen 3 default).
      // Powers Return/Frustration; +5 per level-up, -2 per faint.
      friendship: 70
    };
  }

  pickStarter(speciesId) {
    const safeId = speciesId.toLowerCase();
    const advantageMap = {
      'bulbasaur': 'charmander',
      'charmander': 'squirtle',
      'squirtle': 'bulbasaur'
    };
    
    this.engine.gameState.rivalStarter = advantageMap[safeId];
    const starter = this.generatePokemonInstance(safeId, 5); // Uses its own method
    
    this.engine.gameState.party.push(starter);
    this.engine.gameState.hasStarter = true;
    
    this.engine.gameState.pokedex.seen[safeId] = true;
    this.engine.gameState.pokedex.caught[safeId] = true;
    this.engine.ui.updatePokedexTrackerUI();

    this.engine.ui.printToLog(`You chose ${starter.species}! A fantastic choice.`);
    this.engine.checkGameStart(); // app.js still handles the overall boot flow
  }

  // MOVED FROM APP.JS
  getDynamicTrainer(trainerId) {
    const trainerTemplate = this.engine.db.trainers[trainerId];
    if (!trainerTemplate) return null;

    const trainer = JSON.parse(JSON.stringify(trainerTemplate));

    trainer.party.forEach(mon => {
      if (mon.species === "RIVAL_STARTER") {
        mon.species = this.engine.gameState.rivalStarter;
      }
      if (mon.species === "RIVAL_STARTER_STAGE_2") {
        const stage2Map = { 'bulbasaur': 'ivysaur', 'charmander': 'charmeleon', 'squirtle': 'wartortle' };
        mon.species = stage2Map[this.engine.gameState.rivalStarter];
      }
      if (mon.species === "RIVAL_STARTER_STAGE_3") {
        const stage3Map = { 'bulbasaur': 'venusaur', 'charmander': 'charizard', 'squirtle': 'blastoise' };
        mon.species = stage3Map[this.engine.gameState.rivalStarter];
      }
    });

    return trainer;  
  }

  // Builds full battle-ready party instances for a trainer template,
  // applying custom movesets when the moves exist in moves.json.
  // Moves that don't exist yet are skipped so the generated
  // level-up moves stay intact.
  generateTrainerParty(trainer) {
    const moveDb = (this.engine.db && this.engine.db.moves) || {};
    return (trainer.party || []).map(monData => {
      const enemyMon = this.generatePokemonInstance(monData.species, monData.level);
      if (monData.moves && monData.moves.length > 0) {
        const customMoves = monData.moves.map(moveId => {
          const moveDef = moveDb[moveId];
          if (!moveDef) return null;
          return { ...moveDef, maxPp: moveDef.pp, pp: moveDef.pp };
        }).filter(Boolean);
        if (customMoves.length > 0) {
          enemyMon.moves = customMoves;
        }
      }
      return enemyMon;
    });
  }
}

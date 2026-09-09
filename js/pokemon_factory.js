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
      moves: baseData.moves.slice(0, 4).map(moveId => {
        const moveDef = this.engine.db.moves[moveId];
        if (!moveDef) return null;
        return {
          ...moveDef,
          maxPp: moveDef.pp,
          pp: moveDef.pp
        };
      }).filter(Boolean),
      
      // NEW: Apply accurate EXP values
      exp: startExp,
      maxExp: nextExp
    };
  }
}

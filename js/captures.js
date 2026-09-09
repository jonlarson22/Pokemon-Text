export class CaptureSystem {
  constructor(app) {
    this.app = app;
  }

  attemptCatch(ballKey) {
    const battle = this.app.gameState.activeBattle;
    if (!battle || !battle.enemyMon) return;

    const ballItem = this.app.db.items[ballKey];
    const enemy = battle.enemyMon;
    const speciesData = this.app.db.pokemon[enemy.id] || {};

    // Consume ball from inventory
    this.app.gameState.inventory[ballKey]--;
    if (this.app.gameState.inventory[ballKey] <= 0) {
      delete this.app.gameState.inventory[ballKey];
    }

    this.app.ui.printToLog(`You threw a ${ballItem.name}!`);

    // 1. Status Multiplier
    let statusBonus = 1.0;
    if (['SLP', 'FRZ'].includes(enemy.status)) statusBonus = 2.0;
    else if (['PSN', 'BRN', 'PAR'].includes(enemy.status)) statusBonus = 1.5;

    // 2. Catch Probability Calculation
    const maxHp = enemy.maxHp;
    const currentHp = enemy.hp;
    const baseCatchRate = speciesData.catchRate || enemy.catchRate || 45;
    const ballModifier = ballItem.catchRate || 1.0;

    const hpFactor = (3 * maxHp - 2 * currentHp) / (3 * maxHp);
    let catchProbability = (baseCatchRate * hpFactor * ballModifier * statusBonus) / 255;
    catchProbability = Math.min(1.0, Math.max(0.01, catchProbability));

    // 3. Shake Checks (4 sequential rolls based on probability)
    let shakes = 0;
    const checkShake = () => {
      if (shakes < 3 && Math.random() < Math.pow(catchProbability, 0.25)) {
        shakes++;
        this.app.ui.printToLog("The ball shook...");
        setTimeout(checkShake, 500);
      } else if (shakes === 3 && Math.random() < Math.pow(catchProbability, 0.25)) {
        this.successCapture(enemy, speciesData);
      } else {
        this.app.ui.printToLog(`Oh no! ${enemy.species} broke free!`);
        setTimeout(() => {
          this.app.ui.setMenuState('battle');
        }, 500);
      }
    };

    setTimeout(checkShake, 500);
  }

  successCapture(enemy, speciesData) {
    this.app.ui.printToLog(`Gotcha! ${enemy.species} was caught!`);

    // Record in Pokedex
    if (!this.app.gameState.pokedex) {
      this.app.gameState.pokedex = { caught: {}, seen: {} };
    }
    this.app.gameState.pokedex.caught[enemy.id] = true;
    this.app.gameState.pokedex.seen[enemy.id] = true;

    // Build party-ready Pokémon object
    const caughtPokemon = {
      species: enemy.species,
      id: enemy.id,
      level: enemy.level,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      attack: enemy.attack,
      defense: enemy.defense,
      speed: enemy.speed,
      stats: enemy.stats || { attack: enemy.attack, defense: enemy.defense, spAtk: enemy.attack, spDef: enemy.defense, speed: enemy.speed },
      types: enemy.types || speciesData.types || ["Normal"],
      moves: [...enemy.moves],
      exp: 0,
      maxExp: enemy.level * 100
    };

    // Route to Party or PC Box
    if (this.app.gameState.party.length < 6) {
      this.app.gameState.party.push(caughtPokemon);
      this.app.ui.printToLog(`${enemy.species} was added to your party.`);
    } else {
      if (!this.app.gameState.pc) this.app.gameState.pc = { pokemon: [] };
      this.app.gameState.pc.pokemon.push(caughtPokemon);
      this.app.ui.printToLog(`Your party is full! ${enemy.species} was sent to the PC Box.`);
    }

    // Terminate battle state cleanly
    if (this.app.gameState.activeBattle) {
      this.app.gameState.activeBattle.isOver = true;
      this.app.gameState.activeBattle = null;
    }

    setTimeout(() => {
      this.app.ui.updatePartyUI();
      this.app.ui.setMenuState('route');
    }, 500);
  }
}

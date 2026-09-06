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

    // Consume the ball from inventory
    this.app.gameState.inventory[ballKey]--;
    if (this.app.gameState.inventory[ballKey] <= 0) {
      delete this.app.gameState.inventory[ballKey];
    }

    this.app.printToLog(`You threw a ${ballItem.name}!`);

    // Classic-inspired catch formula calculation
    const maxHp = enemy.maxHp;
    const currentHp = enemy.hp;
    const baseCatchRate = speciesData.catchRate || 45;
    const ballModifier = ballItem.catchRate || 1.0;

    // HP factor: lower health increases catch probability
    const hpFactor = ((3 * maxHp - 2 * currentHp) / (3 * maxHp));
    const catchValue = hpFactor * baseCatchRate * ballModifier;

    // Shake checks simulation (simplified 3-shake system)
    setTimeout(() => {
      this.app.printToLog("The ball shook...");
      
      setTimeout(() => {
        // Random check scaled against a 255 max threshold
        const roll = Math.random() * 255;
        
        if (roll <= catchValue) {
          this.successCapture(enemy, speciesData);
        } else {
          this.app.printToLog(`Oh no! ${enemy.name} broke free!`);
          // Return control back to battle turn structure or enemy counterattack
          setTimeout(() => {
            this.app.setMenuState('battle');
          }, 1500);
        }
      }, 1000);
    }, 1000);
  }

  successCapture(enemy, speciesData) {
    this.app.printToLog(`Gotcha! ${enemy.name} was caught!`);

    // Record in Pokedex
    this.app.gameState.pokedex.caught[enemy.id] = true;
    this.app.gameState.pokedex.seen[enemy.id] = true;

    // Build standard party-ready Pokémon object
    const caughtPokemon = {
      species: enemy.species,
      id: enemy.id,
      level: enemy.level,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      attack: enemy.attack,
      defense: enemy.defense,
      speed: enemy.speed,
      types: speciesData.types || ["Normal"],
      moves: [...enemy.moves],
      exp: 0,
      maxExp: enemy.level * 100
    };

    // Route to Party or PC Box
    if (this.app.gameState.party.length < 6) {
      this.app.gameState.party.push(caughtPokemon);
      this.app.printToLog(`${enemy.name} was added to your party.`);
    } else {
      this.app.gameState.pc.pokemon.push(caughtPokemon);
      this.app.printToLog(`Your party is full! ${enemy.name} was sent to the PC Box.`);
    }

    // End battle and return to route
    this.app.gameState.activeBattle.isOver = true;
    setTimeout(() => {
      this.app.updatePartyUI();
      this.app.setMenuState('route');
    }, 2000);
  }
}

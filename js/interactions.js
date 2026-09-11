// js/interactions.js
export class InteractionManager {
  constructor(gameEngine) {
    this.game = gameEngine; 
  }

  // --- Requirement Checking Helpers ---
  hasItem(itemId, qty = 1) {
    return (this.game.gameState.inventory?.[itemId] || 0) >= qty;
  }

  hasFlag(flagId) {
    return !!this.game.gameState.flags?.[flagId];
  }

  hasPokemonInParty(pokemonId) {
    return this.game.gameState.party.some(mon => mon.species.toLowerCase() === pokemonId.toLowerCase());
  }

  checkRequirements(requirements) {
    if (!requirements || requirements.length === 0) return true;
    return requirements.every(req => {
      if (req.type === 'item') return this.hasItem(req.id, req.qty);
      if (req.type === 'flag') return this.hasFlag(req.id);
      if (req.type === 'pokemon') return this.hasPokemonInParty(req.id);
      return false;
    });
  }

  // --- Reward Granting Helpers ---
  giveItem(itemId, qty = 1) {
    if (!this.game.gameState.inventory) this.game.gameState.inventory = {};
    this.game.gameState.inventory[itemId] = (this.game.gameState.inventory[itemId] || 0) + qty;
    this.game.ui.printToLog(`Received ${qty} x ${itemId}!`);
  }

  setFlag(flagId) {
    if (!this.game.gameState.flags) this.game.gameState.flags = {};
    this.game.gameState.flags[flagId] = true;
  }

  givePokemon(pokemonId, level) {
    const mon = this.game.factory.generatePokemonInstance(pokemonId, level);
    this.game.gameState.party.push(mon);
    this.game.ui.updatePartyUI();
    this.game.ui.printToLog(`Received ${mon.species} (Lv.${level})!`);
  }

  grantRewards(rewards) {
    if (!rewards) return;
    rewards.forEach(reward => {
      const qty = reward.qty || reward.quantity || 1;
      if (reward.type === 'item') this.giveItem(reward.id, qty);
      if (reward.type === 'flag') this.setFlag(reward.id);
      if (reward.type === 'pokemon') this.givePokemon(reward.id, reward.level);
    });
  }

  // --- Main Processing ---
  processNPC(npcId) {
    const npc = this.game.db.npcs[npcId];
    if (!npc) return;

    if (this.checkRequirements(npc.requirements)) {
      this.game.ui.printToLog(npc.dialogue_default || npc.dialogue_success);
      this.grantRewards(npc.rewards);
    } else {
      this.game.ui.printToLog(npc.dialogue_req_unmet || npc.dialogue);
    }
  }
}

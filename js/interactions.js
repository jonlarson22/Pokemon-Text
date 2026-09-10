// js/interactions.js
export class InteractionManager {
  constructor(gameEngine) {
    this.game = gameEngine; 
  }

  // General parser for your new arrays
  checkRequirements(requirements) {
    if (!requirements || requirements.length === 0) return true;
    return requirements.every(req => {
      if (req.type === 'item') return this.game.hasItem(req.id, req.qty);
      if (req.type === 'flag') return this.game.hasFlag(req.id);
      if (req.type === 'pokemon') return this.game.hasPokemonInParty(req.id);
      return false;
    });
  }

  grantRewards(rewards) {
    if (!rewards) return;
    rewards.forEach(reward => {
      if (reward.type === 'item') this.game.giveItem(reward.id, reward.qty);
      if (reward.type === 'flag') this.game.setFlag(reward.id);
      if (reward.type === 'pokemon') this.game.givePokemon(reward.id, reward.level);
    });
  }

  processNPC(npcId) {
    const npc = this.game.db.npcs[npcId];
    if (this.checkRequirements(npc.requirements)) {
        this.game.ui.printToLog(npc.dialogue_success);
        this.grantRewards(npc.rewards);
    } else {
        this.game.ui.printToLog(npc.dialogue_req_unmet || npc.dialogue);
    }
  }
}

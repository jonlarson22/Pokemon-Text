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
      if (req.type === 'item_any_of') return (req.ids || []).some(id => this.hasItem(id, req.qty || 1));
      if (req.type === 'flag') return this.hasFlag(req.id);
      if (req.type === 'pokemon' || req.type === 'pokemon_species') return this.hasPokemonInParty(req.id);
      if (req.type === 'money') return (this.game.gameState.money || 0) >= (req.amount || 0);
      if (req.type === 'flag_count') {
        const flags = this.game.gameState.flags || {};
        const setFlags = Object.keys(flags).filter(f => !!flags[f]);
        let matching;
        if (req.category === 'gym_badges') {
          matching = setFlags.filter(f => f.endsWith('_badge'));
        } else if (req.prefix || req.category) {
          const prefix = req.prefix || req.category;
          matching = setFlags.filter(f => f.startsWith(prefix));
        } else {
          matching = setFlags;
        }
        return matching.length >= (req.qty || req.quantity || 0);
      }
      return false;
    });
  }

  consumeItem(itemId, qty = 1) {
    const inv = this.game.gameState.inventory || {};
    inv[itemId] = Math.max(0, (inv[itemId] || 0) - qty);
    if (inv[itemId] <= 0) delete inv[itemId];
    this.game.gameState.inventory = inv;
  }

  // --- Reward Granting Helpers ---
  itemDisplayName(itemId) {
    const itemDef = this.game.db && this.game.db.items ? this.game.db.items[itemId] : null;
    return itemDef ? itemDef.name : itemId;
  }

  giveItem(itemId, qty = 1) {
    if (!this.game.gameState.inventory) this.game.gameState.inventory = {};
    this.game.gameState.inventory[itemId] = (this.game.gameState.inventory[itemId] || 0) + qty;
    this.game.ui.printToLog(`Received ${qty} x ${this.itemDisplayName(itemId)}!`);
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
      if (reward.type === 'item_consumption') this.consumeItem(reward.id, qty);
      if (reward.type === 'item_consumption_any_of') {
        const found = (reward.ids || []).find(id => this.hasItem(id, qty));
        if (found) this.consumeItem(found, qty);
      }
      if (reward.type === 'money_deduction') {
        this.game.gameState.money = Math.max(0, (this.game.gameState.money || 0) - (reward.amount || 0));
        this.game.ui.updateMoneyUI();
      }
      if (reward.type === 'pokemon_removal') {
        const species = (reward.species || '').toLowerCase();
        const idx = this.game.gameState.party.findIndex(mon => mon.species.toLowerCase() === species);
        if (idx >= 0 && this.game.gameState.party.length > 1) {
          const removed = this.game.gameState.party.splice(idx, 1)[0];
          this.game.ui.printToLog(`Gave away ${removed.species}!`);
          this.game.ui.updatePartyUI();
        }
      }
    });
  }

  removeNPCFromRoute(npcId) {
    const routeId = this.game.gameState.currentRoute;
    if (!this.game.gameState.removedNPCs) this.game.gameState.removedNPCs = {};
    const list = this.game.gameState.removedNPCs[routeId] || [];
    if (!list.includes(npcId)) list.push(npcId);
    this.game.gameState.removedNPCs[routeId] = list;
  }

  // --- Main Processing ---
  processNPC(npcId) {
    const npc = this.game.db.npcs[npcId];
    if (!npc) return;

    // One-time NPCs: once the claim flag is set, rewards can't be claimed again.
    if (npc.once_flag && this.hasFlag(npc.once_flag)) {
      this.game.ui.printToLog(npc.dialogue_repeat || npc.dialogue_default || "...");
      return;
    }

    if (this.checkRequirements(npc.requirements)) {
      this.game.ui.printToLog(npc.dialogue_default || npc.dialogue_success);
      this.grantRewards(npc.rewards);
      if (npc.once_flag) this.setFlag(npc.once_flag);
      if (npc.remove_after_claim) this.removeNPCFromRoute(npcId);
    } else {
      this.game.ui.printToLog(npc.dialogue_req_unmet || npc.dialogue);
    }
  }
}

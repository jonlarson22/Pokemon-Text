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
    if (this.game.gameState.party.length < 6) {
      this.game.gameState.party.push(mon);
      this.game.ui.printToLog(`Received ${mon.species} (Lv.${level})!`);
    } else {
      const pc = this.game.gameState.pc;
      if (!pc || !Array.isArray(pc.pokemon)) this.game.gameState.pc = { pokemon: [], items: {} };
      this.game.gameState.pc.pokemon.push(mon);
      this.game.ui.printToLog(`Received ${mon.species} (Lv.${level})! Sent to the PC.`);
    }
    this.game.ui.updatePartyUI();
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

  // --- In-game trades (RBY-faithful: received mon matches traded mon's level) ---
  // Dynamic placeholders (missing_starter_a/b): the two starters the player
  // did not pick, derived from the rival's starter.
  resolveTradeSpecies(give) {
    give = (give || '').toLowerCase();
    if (give === 'missing_starter_a' || give === 'missing_starter_b') {
      const reverseMap = { 'charmander': 'bulbasaur', 'squirtle': 'charmander', 'bulbasaur': 'squirtle' };
      const playerStarter = reverseMap[(this.game.gameState.rivalStarter || 'charmander').toLowerCase()];
      const missing = ['bulbasaur', 'charmander', 'squirtle'].filter(s => s !== playerStarter);
      return give === 'missing_starter_a' ? missing[0] : missing[1];
    }
    return give;
  }

  offerTrade(npcId, npc) {
    const want = (npc.trade.want || '').toLowerCase();
    const give = this.resolveTradeSpecies(npc.trade.give);
    const party = this.game.gameState.party || [];
    const idx = party.findIndex(mon => (mon.species || '').toLowerCase() === want);
    if (idx < 0) {
      this.game.ui.printToLog(npc.dialogue_no_trade ||
        `You don't have a ${want} in your party to trade!`);
      return;
    }
    const mon = party[idx];
    this.game.ui.printToLog(npc.dialogue_default || `Trade your ${mon.species} for a ${give}?`);
    this.game.ui.openChoiceMenu({
      prompt: `Trade your Lv.${mon.level} ${mon.species} for a ${give}?`,
      yes_label: "Trade",
      no_label: "Cancel",
      decline: "Maybe another time!",
      onYes: () => this.completeTrade(npcId, npc, want, give),
    });
  }

  completeTrade(npcId, npc, want, give) {
    const party = this.game.gameState.party || [];
    const idx = party.findIndex(mon => (mon.species || '').toLowerCase() === want);
    if (idx < 0) {
      this.game.ui.printToLog("The trade fell through...");
      return;
    }
    if (party.length <= 1) {
      this.game.ui.printToLog("You can't trade away your last Pokémon!");
      return;
    }
    const giveSpecies = this.resolveTradeSpecies(give);
    const traded = party.splice(idx, 1)[0];
    this.game.ui.printToLog(`You traded your ${traded.species} (Lv.${traded.level})!`);
    this.givePokemon(giveSpecies, traded.level);
    if (npc.once_flag) this.setFlag(npc.once_flag);
    if (npc.remove_after_claim) this.removeNPCFromRoute(npcId);
  }

  // Safari Zone entry: pay the fee for 30 Safari Balls + the entry flag that
  // unlocks travel into the three wild areas. Re-entry re-pays (fresh balls).
  enterSafari(npc) {
    const cost = npc.safari_cost || 500;
    const ballCount = npc.safari_balls || 30;
    if (this.hasFlag('in_safari_zone') && (this.game.gameState.safariBalls || 0) > 0) {
      this.game.ui.printToLog(`[DRAFT] You're already entered! You have ${this.game.gameState.safariBalls} Safari Balls left -- get out there!`);
      return;
    }
    this.game.ui.openChoiceMenu({
      prompt: `[DRAFT] Pay ¥${cost} for ${ballCount} Safari Balls and entry to all three areas?`,
      onYes: () => {
        if ((this.game.gameState.money || 0) < cost) {
          this.game.ui.printToLog("[DRAFT] You don't have enough money for the entry fee!");
          return;
        }
        this.game.gameState.money -= cost;
        this.game.ui.updateMoneyUI();
        this.game.gameState.safariBalls = ballCount;
        this.setFlag('in_safari_zone', true);
        this.game.ui.printToLog(`[DRAFT] Paid ¥${cost}! You received ${ballCount} Safari Balls! The areas are open -- good hunting!`);
      },
    });
  }

  // --- Main Processing ---
  processNPC(npcId) {
    // Real UI: paced, serialized dialogue. Headless/test UIs (no
    // printDialogue): fully synchronous, unchanged behavior.
    if (this.game.ui.printDialogue) {
      this._talkQueue = (this._talkQueue || Promise.resolve())
        .then(() => this._processNPC(npcId, true), () => this._processNPC(npcId, true));
      return this._talkQueue;
    }
    return this._processNPC(npcId, false);
  }

  // paced=true: story dialogue reveals line by line; rewards/actions run after.
  // paced=false: say() returns undefined (never a promise), so no await is
  // ever reached and this runs fully synchronously for headless callers.
  async _processNPC(npcId, paced) {
    const npc = this.game.db.npcs[npcId];
    if (!npc) return;

    const say = (t) => paced ? this.game.ui.printDialogue(t) : this.game.ui.printToLog(t);
    // Await only when say() returned a real promise. Awaiting an already-
    // resolved value would still yield to the microtask queue and defer
    // rewards past headless callers' assertions.
    const sayWait = (t) => { const r = say(t); return (r && r.then) ? r : null; };

    // One-time NPCs: once the claim flag is set, rewards can't be claimed again.
    const badgeCountEarly = Object.keys(this.game.gameState.flags || {}).filter(f => f.endsWith('_badge') && this.game.gameState.flags[f]).length;
    const subEarly = (t) => (t || "...").replaceAll("{badges}", String(badgeCountEarly));
    if (npc.once_flag && this.hasFlag(npc.once_flag)) {
      const r0 = sayWait(subEarly(npc.dialogue_repeat || npc.dialogue_default || "..."));
      if (r0) await r0;
      return;
    }

    const badgeCount = Object.keys(this.game.gameState.flags || {}).filter(f => f.endsWith('_badge') && this.game.gameState.flags[f]).length;
    const sub = (t) => (t || "...").replaceAll("{badges}", String(badgeCount));
    if (this.checkRequirements(npc.requirements)) {
      const r1 = sayWait(sub(npc.dialogue_default || npc.dialogue_success));
      if (r1) await r1;
      // Special actions (Game Corner counters, slot machines, ...) run instead
      // of the normal reward flow.
      if (npc.action === 'buy_coins') { this.game.facilities.openCoinMenu(); return; }
      if (npc.action === 'open_shop') { this.game.facilities.openShop(npc.shop_id, npc.shop_name); return; }
      if (npc.action === 'play_slots') { this.game.facilities.openSlotMachine(); return; }
      if (npc.action === 'enter_safari') { this.enterSafari(npc); return; }
      if (npc.trade) { this.offerTrade(npcId, npc); return; }
      this.grantRewards(npc.rewards);
      if (npc.once_flag) this.setFlag(npc.once_flag);
      if (npc.remove_after_claim) this.removeNPCFromRoute(npcId);
    } else {
      const r2 = sayWait(sub(npc.dialogue_req_unmet || npc.dialogue));
      if (r2) await r2;
    }
  }
}

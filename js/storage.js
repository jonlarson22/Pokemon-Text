// Bump this when gameState's shape changes in a way old saves can't handle.
const SAVE_VERSION = 3;

export class StorageManager {
  constructor(game) {
    this.game = game;
    // Centralize the save key so it's easily changeable later
    this.saveKey = 'pkmnSaveData';
  }

  // Fill in fields that older saves predate so loaded games don't crash.
  migrateState(state) {
    if (!state.removedNPCs) state.removedNPCs = {};
    if (!state.flags) state.flags = {};
    if (!state.defeatedTrainers) state.defeatedTrainers = {};
    if (!state.visitedTowns) state.visitedTowns = [];
    // Friendship system (save v2): default old saves to the gen 3 base value.
    for (const mon of (state.party || [])) {
      if (mon.friendship === undefined) mon.friendship = 70;
    }
    // Game Corner coins (save v3).
    if (state.coins === undefined) state.coins = 0;
    if (state.saveVersion !== SAVE_VERSION) {
      console.warn(`[save] Save version ${state.saveVersion || "unknown"} loaded; current version is ${SAVE_VERSION}. Some things may not work as expected.`);
      this.game.ui.printToLog("Note: this save is from an older version of the game. Some things may not work as expected.");
      state.saveVersion = SAVE_VERSION;
    }
    return state;
  }

  saveLocal() {
    try {
      this.game.gameState.saveVersion = SAVE_VERSION;
      localStorage.setItem(this.saveKey, JSON.stringify(this.game.gameState));
      this.game.ui.printToLog("Game saved locally!");
    } catch (e) {
      this.game.ui.printToLog("Error saving game to local storage.");
      console.error("Save error:", e);
    }
  }

  loadLocal() {
    try {
      const saveString = localStorage.getItem(this.saveKey);
      if (saveString) {
        this.game.gameState = this.migrateState(JSON.parse(saveString));
        this.updateUIAfterLoad("Game loaded from local storage!");
      } else {
        this.game.ui.printToLog("No local save found.");
      }
    } catch (e) {
      this.game.ui.printToLog("Error loading local save data.");
      console.error("Load error:", e);
    }
  }

  exportSave() {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.game.gameState));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "pokemon_save.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      this.game.ui.printToLog("Game downloaded as pokemon_save.json!");
    } catch (error) {
      this.game.ui.printToLog("Error exporting save data.");
      console.error("Export error:", error);
    }
  }

  handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsedState = JSON.parse(e.target.result);
        // Basic validation to ensure it's actually our save file
        if (parsedState && parsedState.party && parsedState.currentRoute) {
          this.game.gameState = this.migrateState(parsedState);
          this.updateUIAfterLoad("Game loaded successfully from file!");
        } else {
          this.game.ui.printToLog("Error: Invalid save file format.");
        }
      } catch (error) {
        this.game.ui.printToLog("Error: Failed to parse save file.");
        console.error("Import error:", error);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input so the same file can be uploaded again
  }

  // Helper method to refresh the screen state after a load or import
  updateUIAfterLoad(successMessage) {
    this.game.ui.renderRouteScreen();
    this.game.ui.updatePartyUI();
    this.game.ui.updateMoneyUI();
    this.game.ui.updateBadgeUI();
    this.game.ui.updatePokedexTrackerUI();
    this.game.ui.setMenuState('route');
    this.game.ui.printToLog(successMessage);
  }
}

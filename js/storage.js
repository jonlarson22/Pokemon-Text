export class StorageManager {
  constructor(game) {
    this.game = game;
    // Centralize the save key so it's easily changeable later
    this.saveKey = 'pkmnSaveData'; 
  }

  saveLocal() {
    try {
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
        this.game.gameState = JSON.parse(saveString);
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
          this.game.gameState = parsedState;
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
    this.game.ui.updatePokedexTrackerUI();
    this.game.ui.setMenuState('route');
    this.game.ui.printToLog(successMessage);
  }
}

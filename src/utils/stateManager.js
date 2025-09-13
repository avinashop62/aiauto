const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../../config.json');

let config = {};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } else {
            console.error("❌ config.json not found! Please create it from config.template.json.");
            process.exit(1);
        }
    } catch (error) {
        console.error("❌ Error reading or parsing config.json:", error);
        process.exit(1);
    }
}

function getConfig() {
    return config;
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error("❌ Error saving config.json:", error);
    }
}

// Load config on initial require
loadConfig();

module.exports = {
    getConfig,
    saveConfig,
};

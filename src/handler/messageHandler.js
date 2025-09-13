function initialize(bot, state) {
    const { getConfig, saveConfig } = require('../utils/stateManager');
    
    bot.on('message', async (msg) => {
        const config = getConfig();
        if (msg.from.id !== config.ownerId) return;

        const stateKey = `owner_${msg.from.id}`;
        const currentState = state[stateKey];
        if (!currentState) return;

        // Handle forwarded messages
        if (msg.forward_from_chat && (currentState === 'awaiting_start_message' || currentState === 'awaiting_end_message')) {
            const messageToSave = { type: 'text', content: '', caption: msg.caption || '' };
            
            if (msg.photo) {
                messageToSave.type = 'photo';
                messageToSave.content = msg.photo[msg.photo.length - 1].file_id;
            } else if (msg.animation) {
                messageToSave.type = 'animation';
                messageToSave.content = msg.animation.file_id;
            } else if (msg.video) {
                messageToSave.type = 'video';
                messageToSave.content = msg.video.file_id;
            } else if (msg.text) {
                messageToSave.type = 'text';
                messageToSave.content = msg.text;
            } else {
                bot.sendMessage(msg.chat.id, "❌ Unsupported message type. Please forward text, photo, GIF, or video.");
                return;
            }
            
            if (currentState === 'awaiting_start_message') {
                config.sessionStartMessage = messageToSave;
                bot.sendMessage(msg.chat.id, "✅ Session start message has been set!");
            } else {
                config.sessionEndMessage = messageToSave;
                bot.sendMessage(msg.chat.id, "✅ Session end message has been set!");
            }
            delete state[stateKey];
            saveConfig();
            return;
        }
        
        // Handle regular text messages
        if (currentState === 'awaiting_token') {
            config.bearerToken = msg.text.trim();
            saveConfig();
            bot.sendMessage(msg.chat.id, "✅ API Token updated successfully!");
            delete state[stateKey];
        }
    });
}

module.exports = { initialize };

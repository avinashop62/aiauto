function sendMainMenu(bot, chatId, config, messageId = null) {
    const statusText = config.isSessionActive ? 'Session Active ✅' : 'Session Inactive ❌';
    const toggleText = config.isSessionActive ? '⏹️ Stop Session Now' : '▶️ Start Prediction Session';
    const text = `👋 **Prediction Session Manager**\n\n**Status:** ${statusText}`;

    const keyboard = {
        inline_keyboard: [
            [{ text: `📊 Status`, callback_data: 'show_status' }],
            [{ text: toggleText, callback_data: 'toggle_session' }],
            [{ text: '⚙️ Settings', callback_data: 'show_settings' }, { text: '❓ Help', callback_data: 'show_help' }]
        ]
    };

    if (messageId) {
        bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard }).catch(() => {});
    } else {
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
}

function sendSettingsMenu(bot, chatId, messageId) {
    const text = '⚙️ **Settings Menu**';
    bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '💌 Set Start Message', callback_data: 'prompt_start_message' }],
                [{ text: '💌 Set End Message', callback_data: 'prompt_end_message' }],
                [{ text: '⏱️ Set Prediction Interval', callback_data: 'show_interval_menu' }],
                [{ text: '📢 Set Channel', callback_data: 'prompt_channel' }],
                [{ text: '🔑 Set API Token', callback_data: 'prompt_token' }],
                [{ text: '🔙 Back to Main Menu', callback_data: 'main_menu' }]
            ]
        }
    });
}

function sendSessionDurationMenu(bot, chatId, messageId) {
    const text = '⏳ **Select Session Duration**\n\nHow long should the prediction session run?';
    bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '30 Minutes', callback_data: 'start_session_30' }, { text: '1 Hour', callback_data: 'start_session_60' }],
                [{ text: '2 Hours', callback_data: 'start_session_120' }],
                [{ text: '🔙 Back', callback_data: 'main_menu' }]
            ]
        }
    });
}

function sendIntervalMenu(bot, chatId, messageId) {
    const text = '⏱️ **Set Prediction Interval**\n\nDuring a session, how often should predictions be sent?';
    bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Every 1 Min', callback_data: 'set_interval_1' }, { text: 'Every 2 Mins', callback_data: 'set_interval_2' }],
                [{ text: 'Every 5 Mins', callback_data: 'set_interval_5' }],
                [{ text: '🔙 Back to Settings', callback_data: 'show_settings' }]
            ]
        }
    });
}

module.exports = {
    sendMainMenu,
    sendSettingsMenu,
    sendSessionDurationMenu,
    sendIntervalMenu,
};

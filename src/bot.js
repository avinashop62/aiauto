const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const cronParser = require('cron-parser');

const stateManager = require('./utils/stateManager');
const ui = require('./menus/ui');
const predictionService = require('./services/predictionService');
const messageHandler = require('./handlers/messageHandler');

let config = stateManager.getConfig();
let bot;
let botInfo;
let cronJob = null;
let sessionTimeout = null;
let ownerState = {}; // In-memory state for prompts

// --- INITIALIZATION ---
(async () => {
    if (!config.botToken || !config.ownerId) {
        console.error("❌ Bot Token or Owner ID is missing in config.json.");
        process.exit(1);
    }

    bot = new TelegramBot(config.botToken, { polling: true });
    botInfo = await bot.getMe();
    console.log(`✅ Session Bot started! Name: ${botInfo.first_name}`);

    // Initialize handlers
    messageHandler.initialize(bot, ownerState);
    setupMainListeners();

    // Resume session if bot restarts
    if (config.isSessionActive && config.sessionEndTime) {
        const remainingTime = config.sessionEndTime - Date.now();
        if (remainingTime > 0) {
            console.log(`Resuming session with ${Math.round(remainingTime / 60000)} minutes remaining.`);
            cronJob = cron.schedule(config.predictionIntervalCron, runPredictionTask);
            sessionTimeout = setTimeout(() => endSession(false), remainingTime);
        } else {
            console.log('Session had expired while bot was offline. Cleaning up.');
            endSession(true); // End silently
        }
    }
})();

function setupMainListeners() {
    bot.onText(/\/start/, (msg) => {
        if (msg.from.id !== config.ownerId) return;
        ui.sendMainMenu(bot, msg.chat.id, config);
    });

    bot.on('my_chat_member', (update) => {
        const chat = update.chat;
        if (chat.type !== 'channel') return;
        if (['administrator', 'member'].includes(update.new_chat_member.status)) {
            config.knownChannels[chat.id] = chat.title;
        } else if (['left', 'kicked'].includes(update.new_chat_member.status)) {
            delete config.knownChannels[chat.id];
            if (config.predictionChatId == chat.id) config.predictionChatId = null;
        }
        stateManager.saveConfig();
    });

    // --- CALLBACK HANDLER LOGIC ---
    bot.on('callback_query', async (callbackQuery) => {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        if (msg.chat.id !== config.ownerId) return;

        await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

        const stateKey = `owner_${msg.chat.id}`;

        // Main Navigation
        if (data === 'main_menu') ui.sendMainMenu(bot, msg.chat.id, config, msg.message_id);
        if (data === 'show_settings') ui.sendSettingsMenu(bot, msg.chat.id, msg.message_id);
        if (data === 'show_interval_menu') ui.sendIntervalMenu(bot, msg.chat.id, msg.message_id);
        if (data === 'show_status') await sendStatus(msg.chat.id);
        if (data === 'show_help') await sendHelp(msg.chat.id);

        // Session Control
        if (data === 'toggle_session') {
            if (config.isSessionActive) {
                endSession(false);
                bot.sendMessage(msg.chat.id, "⏹️ Session has been manually stopped.");
            } else {
                ui.sendSessionDurationMenu(bot, msg.chat.id, msg.message_id);
            }
        }
        
        if (data.startsWith('start_session_')) {
            const durationMinutes = parseInt(data.replace('start_session_', ''));
            startSession(durationMinutes);
            bot.editMessageText(`✅ Session started for **${durationMinutes} minutes**!`, {
                chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'Markdown'
            });
        }

        // Settings
        if (data.startsWith('set_interval_')) {
            const minutes = data.replace('set_interval_', '');
            config.predictionIntervalCron = `5 */${minutes} * * * *`;
            stateManager.saveConfig();
            bot.editMessageText(`✅ Prediction interval set to **every ${minutes} minute(s)**.`, {
                chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'Markdown'
            });
        }

        if (data === 'prompt_start_message') {
            bot.sendMessage(msg.chat.id, "💌 Please forward the message you want to send when a session **starts**.");
            ownerState[stateKey] = 'awaiting_start_message';
        }
        if (data === 'prompt_end_message') {
            bot.sendMessage(msg.chat.id, "💌 Please forward the message you want to send when a session **ends**.");
            ownerState[stateKey] = 'awaiting_end_message';
        }
        if (data === 'prompt_token') {
            bot.sendMessage(msg.chat.id, "🔑 Please send your API Bearer Token.\n(Remember: Only the long code, without 'Bearer')");
            ownerState[stateKey] = 'awaiting_token';
        }
        
        // Channel Setup Flow
        if (data === 'prompt_channel') promptForChannel(msg);
        if (data === 'select_channel_list') selectChannelList(msg);
        if (data.startsWith('select_channel_id_')) {
            const channelId = data.replace('select_channel_id_', '');
            config.predictionChatId = channelId;
            stateManager.saveConfig();
            bot.editMessageText(`✅ **Channel Set!**\nPredictions will be sent to: **${config.knownChannels[channelId]}**`, {
                chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'Markdown'
            });
        }
    });
}

// --- SESSION & CORE LOGIC ---
async function startSession(durationMinutes) {
    if (config.isSessionActive) return;
    if (!config.predictionChatId || !config.bearerToken) {
        bot.sendMessage(config.ownerId, "❌ Cannot start. Set channel and API token first.");
        return;
    }

    console.log(`Starting session for ${durationMinutes} minutes.`);
    await sendMessageFromConfig(config.predictionChatId, config.sessionStartMessage);

    config.isSessionActive = true;
    config.sessionEndTime = Date.now() + durationMinutes * 60 * 1000;
    stateManager.saveConfig();

    cronJob = cron.schedule(config.predictionIntervalCron, runPredictionTask);
    sessionTimeout = setTimeout(() => endSession(false), durationMinutes * 60 * 1000);
    
    ui.sendMainMenu(bot, config.ownerId, config, bot.lastMessageId);
}

async function endSession(silent = false) {
    if (!config.isSessionActive && !silent) return;
    
    console.log("Ending session.");
    if (cronJob) cronJob.stop();
    if (sessionTimeout) clearTimeout(sessionTimeout);
    cronJob = null;
    sessionTimeout = null;

    config.isSessionActive = false;
    config.sessionEndTime = null;
    stateManager.saveConfig();

    if (!silent) {
        await sendMessageFromConfig(config.predictionChatId, config.sessionEndMessage);
        ui.sendMainMenu(bot, config.ownerId, config, bot.lastMessageId);
    }
}

async function runPredictionTask() {
    const result = await predictionService.runPredictionCycle(config);
    if (!result) return;

    if (result.error === "Authorization") {
        await bot.sendMessage(config.ownerId, "🚨 **Token Expired!** Session has been stopped. Please set a new token.");
        endSession(true); // Silently end
        ui.sendMainMenu(bot, config.ownerId, config);
        return;
    } else if (result.error) {
        await bot.sendMessage(config.ownerId, `⚠️ **Prediction Error:** ${result.error}`);
        return;
    }

    // This is a placeholder for your actual prediction message logic
    const predictionMessage = `
    🆔 **PERIOD:** \`${result.nextPeriod}\`
    🎲 **INVEST:** \`${result.invest}\`
    `;
    await bot.sendMessage(config.predictionChatId, predictionMessage, { parse_mode: 'Markdown' });
}

// --- UTILITY & HELPER FUNCTIONS ---
async function sendMessageFromConfig(chatId, messageConfig) {
    if (!chatId) return;
    try {
        const options = { caption: messageConfig.caption, parse_mode: 'Markdown' };
        switch (messageConfig.type) {
            case 'photo': await bot.sendPhoto(chatId, messageConfig.content, options); break;
            case 'animation': await bot.sendAnimation(chatId, message.content, options); break;
            case 'video': await bot.sendVideo(chatId, messageConfig.content, options); break;
            case 'text':
            default: await bot.sendMessage(chatId, messageConfig.content, { parse_mode: 'Markdown' }); break;
        }
    } catch (e) {
        console.error(`Failed to send message:`, e.message);
        bot.sendMessage(config.ownerId, `⚠️ **Warning:** Could not send the configured message to your channel. Please check my permissions.`);
    }
}

async function sendStatus(chatId) {
    const channelTitle = config.predictionChatId ? config.knownChannels[config.predictionChatId] || 'Not Set' : 'Not Set';
    let sessionStatus = 'Inactive';
    if(config.isSessionActive && config.sessionEndTime) {
        const remaining = Math.round((config.sessionEndTime - Date.now()) / 60000);
        sessionStatus = `Active ✅ (${remaining > 0 ? remaining : 0} minutes remaining)`;
    }

    const statusText = `
📊 **Bot Status Report**

- **Session Status:** \`${sessionStatus}\`
- **Prediction Channel:** \`${channelTitle}\`
- **Prediction Interval:** \`${config.predictionIntervalCron}\`
- **Start Message Set:** \`${config.sessionStartMessage ? '✔️' : '❌'}\`
- **End Message Set:** \`${config.sessionEndMessage ? '✔️' : '❌'}\`
    `;
    await bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
}

function promptForChannel(msg) {
    const text = `📢 **How to Set Your Channel**\n\n1️⃣ **Add this bot** (@${botInfo.username}) to your channel.\n2️⃣ **Promote it to an Administrator.**\n3️⃣ Click the button below to select it.`;
    bot.editMessageText(text, {
        chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🔄 Refresh & Select Channel', callback_data: 'select_channel_list' }],
                [{ text: '🔙 Back to Settings', callback_data: 'show_settings' }]
            ]
        }
    });
}

function selectChannelList(msg) {
    const channelButtons = Object.entries(config.knownChannels).map(([id, title]) => ([{ text: title, callback_data: `select_channel_id_${id}` }]));
    if (channelButtons.length === 0) {
        bot.editMessageText("I'm not in any channels yet. Add me to one and make me an admin, then try again.", {
            chat_id: msg.chat.id, message_id: msg.message_id,
            reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'prompt_channel' }]]}
        });
        return;
    }
    bot.editMessageText('✅ Great! Please select your channel:', {
        chat_id: msg.chat.id, message_id: msg.message_id,
        reply_markup: { inline_keyboard: channelButtons }
    });
}

async function sendHelp(chatId) {
    const helpText = `❓ **Help & Bot Guide**\n\nThis bot works in **sessions**. You start a session for a specific duration (e.g., 1 hour), and it sends predictions at a set interval during that time.\n\n- **▶️ Start Session:** Begins the prediction process.\n- **⏹️ Stop Session:** Manually ends the current session.\n- **📊 Status:** Shows if a session is active and for how much longer.\n\n**⚙️ Settings**\n- **Set Start/End Message:** Forward a message to set what it posts at the beginning and end of each session.\n- **Set Prediction Interval:** Choose how often predictions are sent *during* a session.`;
    await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
}

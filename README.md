# Advanced Telegram Prediction Bot

This is a session-based prediction bot for Telegram.

## Features
- Session management (start/stop for a specific duration)
- Custom start and end messages (text, photo, GIF)
- Easy interval configuration
- Fully interactive menu-based controls

## Setup
1. Clone the repository.
2. Create `config.json` from `config.template.json` and fill in your details.
3. Run `npm install`.
4. Start the bot using PM2: `pm2 start src/bot.js --name "prediction-bot"`

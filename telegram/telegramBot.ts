import TelegramBot from 'node-telegram-bot-api';
import { retrieveEnvVariable } from '../utils/utils';

const TG_BOT_TOKEN = retrieveEnvVariable('TELEGRAM_BOT_TOKEN');
const TG_CHAT_ID = retrieveEnvVariable('TG_CHAT_ID');

// Create bot with polling configuration and all required options
const bot = new TelegramBot(TG_BOT_TOKEN, { 
    polling: {
        interval: 300, // Poll more frequently
        params: {
            timeout: 10,
            allowed_updates: ["message", "callback_query", "channel_post"] // Explicitly specify what updates we want
        },
        autoStart: false
    }
});

// Add error handlers but don't log EFATAL errors as they're usually temporary
bot.on('polling_error', (error: any) => {
    if (error.code !== 'EFATAL') {
        console.log('\n=== Telegram Polling Error ===');
        console.log('Error Code:', error.code);
        console.log('Error Message:', error.message);
        console.log('============================\n');
    }
});

// Add reconnection logic
bot.on('error', (error: Error) => {
    console.log('Telegram bot error, attempting to reconnect...');
    setTimeout(() => {
        bot.startPolling();
    }, 5000);
});

// Initialize bot and start polling
export async function initializeBot() {
    try {
        // First, stop any existing polling
        await bot.stopPolling();
        
        // Set commands before starting
        await bot.setMyCommands([
            { command: 'hopfun', description: 'Open the Hop.Fun main menu' },
            { command: 'sell', description: 'Sell a token' },
            { command: 'balance', description: 'Get the balance of a token' },
            { command: 'ourbalance', description: 'Get our SUI balance' },
            { command: 'refresh', description: 'Refresh cookies (DONT USE OFTEN)' },
            { command: 'autobuyon', description: 'Enable auto-buy' },
            { command: 'autobuyoff', description: 'Disable auto-buy' },
            { command: 'autobuyconfig', description: 'Configure auto-buy settings' },
            { command: 'autobuystatus', description: 'Check current auto-buy settings' }
        ]);

        // Start polling
        await bot.startPolling();
        
        // Send a test message to verify bot is working
        const botInfo = await bot.getMe();
        console.log(`Telegram bot ${botInfo.username} started successfully`);
        
    } catch (error) {
        console.error('Error starting Telegram bot:', error);
        throw error;
    }
}

export { bot, TG_CHAT_ID };
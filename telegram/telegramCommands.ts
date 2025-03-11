// telegramCommands.ts
import { bot } from './telegramBot';
import { retrieveEnvVariable, logger } from '../utils/utils';
import { buyToken } from '../transactions/snipe';
import { getOurBalance } from '../helpers/getOurBalance';
import { getTokenBalance } from '../helpers/getTokenBalance';
import { sellTokens } from '../transactions/sell';
import { getToken } from '../helpers/database';
import { escapeMarkdown } from './telegramMessages';
import { getSettings, toggleAutoBuy, updateSettings } from '../config/autoBuySettings';

// Define the bot commands
const commands = [
    { command: 'hopfun', description: 'Open the Hop.Fun main menu' },
    { command: 'sell', description: 'Sell a token' },
    { command: 'balance', description: 'Get the balance of a token' },
    { command: 'ourbalance', description: 'Get our SUI balance' },
    { command: 'refresh', description: 'Refresh cookies (DONT USE OFTEN)' },
    { command: 'add_to_blacklist', description: 'Add an address to the blacklist' },
    { command: 'add_to_funding', description: 'Add an address to the funding list' },
    { command: 'autobuyon', description: 'Enable auto-buy' },
    { command: 'autobuyoff', description: 'Disable auto-buy' },
    { command: 'autobuyconfig', description: 'Configure auto-buy settings' },
    { command: 'autobuystatus', description: 'Check current auto-buy settings' }
];

// Register the commands with Telegram
bot.setMyCommands(commands);

function isAllowedChat(chatId: number): boolean {
    const allowedChatId = parseInt(retrieveEnvVariable('TG_CHAT_ID'), 10);
    return chatId === allowedChatId;
}

function restrictAccess(callback: (msg: any) => void) {
    return (msg: any) => {
        const chatId = msg.chat.id;
        if (!isAllowedChat(chatId)) {
            bot.sendMessage(chatId, "Unauthorized access. This bot is restricted to a specific group.");
            return;
        }
        callback(msg);
    };
}

function restrictAccessCallback(callback: (callbackQuery: any) => void) {
    return (callbackQuery: any) => {
        const chatId = callbackQuery.message.chat.id;
        if (!isAllowedChat(chatId)) {
            bot.answerCallbackQuery(callbackQuery.id, { text: "Unauthorized access. This bot is restricted to a specific group.", show_alert: true });
            return;
        }
        callback(callbackQuery);
    };
}

// Handle the /sell command
bot.onText(/\/sell/, restrictAccess((msg: any) => {
    const chatId = msg.chat.id;
    const mention = msg.from.username ? `@${msg.from.username}` : (msg.from.first_name || 'User');

    bot.sendMessage(chatId, `${mention}; Please enter the listing ID:`, {
        reply_markup: {
            force_reply: true,
        }
    }).then((sentMessage) => {
        const listingIdListener = async (msg: any) => {
            if (msg.reply_to_message && msg.reply_to_message.message_id === sentMessage.message_id) {
                const listingId = msg.text.trim();
                
                // Get token data from database
                const tokenData = await getToken(listingId);
                if (!tokenData) {
                    bot.sendMessage(chatId, `${mention}; Token not found with listing ID: ${listingId}`);
                    return;
                }

                bot.sendMessage(chatId, `${mention}; Please enter the percentage to sell (1-100):`, {
                    reply_markup: {
                        force_reply: true,
                    }
                }).then((percentMessage) => {
                    const percentListener = async (percentMsg: any) => {
                        if (percentMsg.reply_to_message && percentMsg.reply_to_message.message_id === percentMessage.message_id) {
                            const percentage = parseInt(percentMsg.text.trim());

                            if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
                                bot.sendMessage(chatId, `❌ ${mention}; Invalid percentage. Please enter a number between 1 and 100.`);
                                return;
                            }

                            const processingMsg = await bot.sendMessage(chatId, `Processing sell order for ${percentage}%...`);

                            try {
                                const result = await sellTokens(tokenData.token_address, percentage);
                                await bot.deleteMessage(chatId, processingMsg.message_id);

                                if (result.success) {
                                    const remainingPercentage = await getTokenBalance(tokenData.token_address);
                                    await bot.sendMessage(
                                        chatId, 
                                        `✅ Successfully sold ${percentage}%\n` +
                                        `\`${escapeMarkdown(tokenData.token_address)}\`\n` +
                                        `Remaining balance: ${remainingPercentage.toFixed(2)}% of total supply`,
                                        { parse_mode: 'Markdown' }
                                    );
                                } else {
                                    await bot.sendMessage(chatId, `❌ Error selling ${percentage}% of tokens`);
                                }
                            } catch (error: any) {
                                console.error('Error executing sell:', error);
                                await bot.sendMessage(chatId, `❌ Error processing sell order: ${error.message}`);
                            }

                            // Clean up messages
                            bot.deleteMessage(chatId, sentMessage.message_id);
                            bot.deleteMessage(chatId, msg.message_id);
                            bot.deleteMessage(chatId, percentMsg.message_id);
                            bot.deleteMessage(chatId, percentMessage.message_id);
                        }
                    };
                    bot.on('message', percentListener);
                });
            }
        };
        bot.on('message', listingIdListener);
    });
}));

// Handle the /balance command
bot.onText(/\/balance/, restrictAccess((msg: any) => {
    const chatId = msg.chat.id;
    const mention = msg.from.username ? `@${msg.from.username}` : (msg.from.first_name || 'User');

    bot.sendMessage(chatId, `${mention}; Please enter the listing ID:`, {
        reply_markup: {
            force_reply: true,
        }
    }).then((sentMessage) => {
        const replyListener = async (msg: any) => {
            if (msg.reply_to_message && msg.reply_to_message.message_id === sentMessage.message_id) {
                const listingId = msg.text.trim();

                try {
                    const tokenData = await getToken(listingId);
                    if (!tokenData) {
                        throw new Error('Token not found');
                    }

                    const percentOfSupply = await getTokenBalance(tokenData.token_address);
                    bot.sendMessage(
                        chatId, 
                        `🏦 ${mention}; We hold ${percentOfSupply.toFixed(2)}% of ${tokenData.name} supply`
                    );
                } catch (error: any) {
                    bot.sendMessage(
                        chatId, 
                        `❌ ${mention}; Error fetching balance: ${error.message}`
                    );
                }

                // Delete the prompt message and the user's reply
                bot.deleteMessage(chatId, sentMessage.message_id);
                bot.deleteMessage(chatId, msg.message_id);
                bot.removeListener('message', replyListener);
            }
        };
        bot.on('message', replyListener);
    });
}));

// Handle the /ourbalance command
bot.onText(/\/ourbalance/, restrictAccess(async (msg: any) => {
    try {
        const chatId = msg.chat.id;
        const mention = msg.from.username ? `@${msg.from.username}` : (msg.from.first_name || 'User');
        
        const { totalBalance, balances } = await getOurBalance(true);

        const walletBalances = balances
            .map((balance, index) => 
                `Wallet ${index + 1}: ${Number(balance).toFixed(2)} SUI`
            )
            .join('\n');

        await bot.sendMessage(
            chatId,
            `💰 ${mention}; Our Total Balance: ${Number(totalBalance).toFixed(2)} SUI\n\n${walletBalances}`
        );
    } catch (error) {
        console.error('Error in /ourbalance command:', error);
        await bot.sendMessage(msg.chat.id, 'Error fetching balance. Please try again.');
    }
}));

// Keep other utility functions (blacklist, funding, etc.) as they are...
// They don't interact with token data so they don't need modification

export const handleBuyCallbackQuery = async (callbackQuery: any) => {
    const chatId = callbackQuery.message.chat.id;
    const mention = callbackQuery.from.username ? 
        `@${callbackQuery.from.username}` : 
        callbackQuery.from.first_name || 'User';

    bot.sendMessage(chatId, `${mention}; Please enter the listing ID:`, {
        reply_markup: {
            force_reply: true,
        }
    }).then((sentMessage) => {
        const listingIdListener = async (msg: any) => {
            if (msg.reply_to_message && msg.reply_to_message.message_id === sentMessage.message_id) {
                const listingId = msg.text.trim();
                
                // Get token data from database
                const tokenData = await getToken(listingId);
                if (!tokenData) {
                    bot.sendMessage(chatId, `${mention}; Token not found with listing ID: ${listingId}`);
                    return;
                }

                bot.sendMessage(chatId, `${mention}; Please enter the amount of SUI you want to spend:`, {
                    reply_markup: {
                        force_reply: true,
                    }
                }).then((amountMessage) => {
                    const amountListener = async (msg: any) => {
                        if (msg.reply_to_message && msg.reply_to_message.message_id === amountMessage.message_id) {
                            const suiAmount = parseFloat(msg.text.trim());
                            
                            try {
                                const success = await buyToken(
                                    tokenData.token_address,
                                    suiAmount,
                                    0 // minOutput
                                );

                                if (success) {
                                    bot.sendMessage(
                                        chatId, 
                                        `✅ ${mention}; Successfully bought ${suiAmount} SUI worth of ${tokenData.name}`
                                    );
                                } else {
                                    bot.sendMessage(
                                        chatId, 
                                        `❌ ${mention}; Transaction failed. Please check your SUI balance and try again.`
                                    );
                                }
                            } catch (error: any) {
                                bot.sendMessage(
                                    chatId, 
                                    `❌ ${mention}; Error during purchase: ${error.message}`
                                );
                                logger.error("Error during purchase:", error);
                            }

                            // Clean up messages
                            bot.deleteMessage(chatId, sentMessage.message_id);
                            bot.deleteMessage(chatId, msg.message_id);
                            bot.deleteMessage(chatId, amountMessage.message_id);
                        }
                    };
                    bot.on('message', amountListener);
                });
            }
        };
        bot.on('message', listingIdListener);
    });
};

// Keep the rest of the menu-related code as is...

// Add new commands
bot.onText(/\/autobuyon/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowedChat(chatId)) return;

    try {
        toggleAutoBuy(true);
        await bot.sendMessage(chatId, '🤖 Auto-buy has been enabled');
        
        // Send current settings
        const settings = getSettings();
        await bot.sendMessage(chatId, 
            '📊 Current Settings:\n' +
            `• Max Previous Launches: ${settings.maxPreviousLaunches}\n` +
            `• Min Creator Balance: ${settings.minCreatorBalance} SUI\n` +
            `• Max Creator Supply: ${settings.maxCreatorSupply}%\n` +
            `• Buy Amount: ${settings.buyAmount} SUI`
        );
    } catch (error) {
        console.error('Error in autobuyon command:', error);
        await bot.sendMessage(chatId, '❌ Error enabling auto-buy');
    }
});

bot.onText(/\/autobuyoff/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowedChat(chatId)) return;

    try {
        toggleAutoBuy(false);
        await bot.sendMessage(chatId, '🤖 Auto-buy has been disabled');
    } catch (error) {
        console.error('Error in autobuyoff command:', error);
        await bot.sendMessage(chatId, '❌ Error disabling auto-buy');
    }
});

bot.onText(/\/autobuyconfig/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowedChat(chatId)) return;

    try {
        const configMsg = await bot.sendMessage(chatId, 
            'Enter settings in format:\n' +
            'max_launches,min_balance,max_supply,buy_amount\n' +
            'Example: 0,50,10,1\n\n' +
            'Where:\n' +
            '- max_launches: Maximum previous launches (e.g., 0)\n' +
            '- min_balance: Minimum creator SUI balance (e.g., 50)\n' +
            '- max_supply: Maximum creator supply % (e.g., 10)\n' +
            '- buy_amount: Amount of SUI to buy (e.g., 1)',
            { reply_markup: { force_reply: true } }
        );

        // Create one-time message listener
        bot.onReplyToMessage(chatId, configMsg.message_id, async (replyMsg) => {
            try {
                if (!replyMsg.text) {
                    throw new Error('No text provided');
                }

                const [maxLaunches, minBalance, maxSupply, buyAmount] = replyMsg.text.split(',').map(Number);
                
                if (isNaN(maxLaunches) || isNaN(minBalance) || isNaN(maxSupply) || isNaN(buyAmount)) {
                    throw new Error('Invalid number format');
                }

                updateSettings({
                    maxPreviousLaunches: maxLaunches,
                    minCreatorBalance: minBalance,
                    maxCreatorSupply: maxSupply,
                    buyAmount: buyAmount
                });

                await bot.sendMessage(chatId, 
                    '✅ Settings updated:\n' +
                    `• Max Previous Launches: ${maxLaunches}\n` +
                    `• Min Creator Balance: ${minBalance} SUI\n` +
                    `• Max Creator Supply: ${maxSupply}%\n` +
                    `• Buy Amount: ${buyAmount} SUI`
                );
            } catch (error) {
                await bot.sendMessage(chatId, '❌ Invalid format. Please use numbers only.');
            }
        });
    } catch (error) {
        console.error('Error in autobuyconfig command:', error);
        await bot.sendMessage(chatId, '❌ Error configuring auto-buy');
    }
});

bot.onText(/\/autobuystatus/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowedChat(chatId)) return;

    try {
        const settings = getSettings();
        await bot.sendMessage(chatId, 
            '🤖 Auto-buy Status:\n' +
            `• Enabled: ${settings.enabled ? '✅' : '❌'}\n` +
            `• Max Previous Launches: ${settings.maxPreviousLaunches}\n` +
            `• Min Creator Balance: ${settings.minCreatorBalance} SUI\n` +
            `• Max Creator Supply: ${settings.maxCreatorSupply}%\n` +
            `• Buy Amount: ${settings.buyAmount} SUI\n` +
            `• Require Social Links: ${settings.requireSocialLinks ? '✅' : '❌'}`
        );
    } catch (error) {
        console.error('Error in autobuystatus command:', error);
        await bot.sendMessage(chatId, '❌ Error getting auto-buy status');
    }
});

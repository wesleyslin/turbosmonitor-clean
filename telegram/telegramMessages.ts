// telegramMessages.ts
import { bot, TG_CHAT_ID } from './telegramBot';
import { buyToken } from '../transactions/snipe';
import { sellTokens } from '../transactions/sell';
import { getTokenBalance } from '../helpers/getTokenBalance';
import { getToken } from '../helpers/database';

export function escapeMarkdown(text: string | undefined): string {
    if (!text) return "N/A";
    return text.replace(/([_*[\]~`>#+=\\])/g, match => 
        match === "+" ? match : "\\" + match
    );
}

function escapeUrl(url: string | undefined): string {
    if (!url) return "N/A";
    return url.replace(/([_*[\]()~`>#+|{}\\])/g, match => 
        match === "+" ? match : "\\" + match
    );
}

// Helper function to ensure 0x prefix
function ensure0xPrefix(address: string): string {
    return address.startsWith('0x') ? address : `0x${address}`;
}

interface CreatorInfo {
    balance: number;
    previousLaunches: number;
    creatorSupply: number;
}

async function sendTokenImage(chatId: string, imageUrl: string) {
    if (!imageUrl) {
        console.debug('No image URL provided');
        return;
    }
    
    try {        
        // Skip if it's an SVG file
        if (imageUrl.toLowerCase().endsWith('.svg')) {
            console.debug('Skipping SVG image');
            return;
        }

        // Only try to send if it's a valid image URL
        if (imageUrl.startsWith('http') && (
            imageUrl.toLowerCase().endsWith('.png') ||
            imageUrl.toLowerCase().endsWith('.jpg') ||
            imageUrl.toLowerCase().endsWith('.jpeg') ||
            imageUrl.toLowerCase().endsWith('.gif') ||
            imageUrl.toLowerCase().endsWith('.webp')  // Added webp support
        )) {
            // Use InputFile for better compatibility
            const imageOptions = {
                filename: 'token_image',
                contentType: 'image/jpeg'  // Default content type
            };

            try {
                await bot.sendPhoto(chatId, imageUrl, {}, imageOptions);
            } catch (sendError) {
                console.debug('Failed to send image directly, error:', sendError);
                
                // Fallback: Try sending as URL
                await bot.sendMessage(chatId, `[View Token Image](${imageUrl})`, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: false
                });
            }
        } else {
            console.debug('Invalid image URL or unsupported format:', imageUrl);
        }
    } catch (error) {
        console.debug('Error in sendTokenImage:', error);
    }
}

export async function sendTelegramListing(listingId: string, creatorInfo?: CreatorInfo): Promise<void> {
    try {
        // Get token data from database
        const tokenData = await getToken(listingId);
        if (!tokenData) {
            console.error(`Token with listing ID ${listingId} not found in database`);
            return;
        }

        const messageText = `━━━━━━━━━━━━━━━━━━━━━━━
*${escapeMarkdown(tokenData.name)}* #${escapeMarkdown(tokenData.symbol)}
\`${tokenData.pool_id}\`

\`${escapeMarkdown(tokenData.description)}\`

🌐 Socials: 
  - X: ${escapeMarkdown(tokenData.twitter)}
  - Telegram: ${escapeMarkdown(tokenData.telegram)}
  - Website: ${escapeMarkdown(tokenData.website)}

🔧 Token Info:
  - Type: \`${ensure0xPrefix(tokenData.token_address)}\`
  - [Chart](https://app.turbos.finance/fun/#/fun/${ensure0xPrefix(tokenData.token_address)})

📊 Background:
  - Creator: [${escapeMarkdown(tokenData.creator_address)}](https://suivision.xyz/address/${tokenData.creator_address})
  - Previous Launches: ${creatorInfo?.previousLaunches === 0 ? "0" : (creatorInfo?.previousLaunches || "unknown")}
  - Deployer Balance: ${(creatorInfo?.balance || 0).toFixed(2)} SUI
  - Creator Supply: ${(creatorInfo?.creatorSupply || 0).toFixed(2)}% of total supply

━━━━━━━━━━━━━━━━━━━━━━━`;

        const opts: any = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "💵 Buy 1 SUI", callback_data: `buy_${listingId}_1` },
                        { text: "💵 Buy 25 SUI", callback_data: `buy_${listingId}_25` }
                    ],
                    [
                        { text: "💵 Buy 50 SUI", callback_data: `buy_${listingId}_50` },
                        { text: "💵 Buy 100 SUI", callback_data: `buy_${listingId}_100` }
                    ],
                    [
                        { text: "💵 Buy 300 SUI", callback_data: `buy_${listingId}_300` }
                    ],
                    [
                        { text: "🛑 Sell 10%", callback_data: `sell_${listingId}_10` },
                        { text: "🛑 Sell 40%", callback_data: `sell_${listingId}_40` }
                    ],
                    [
                        { text: "🛑 Sell All", callback_data: `sell_${listingId}_100` }
                    ],
                    [
                        { text: "🏦 Get Balance", callback_data: `balance_${listingId}` }
                    ]
                ]
            },
            parse_mode: "Markdown",
            disable_web_page_preview: true
        };

        // Send the main message
        await bot.sendMessage(TG_CHAT_ID, messageText, opts);

        // Try to send image if available, but handle it gracefully
        if (tokenData.uri) {
            await sendTokenImage(TG_CHAT_ID, tokenData.uri);
        }
    } catch (error) {
        console.error('Error sending Telegram message:', error);
    }
}

// Handle button callbacks
bot.on('callback_query', async (ctx: any) => {
    try {
        if (!ctx?.data) return;

        const [action, listingId, amount] = ctx.data.split('_');
        const chatId = ctx?.message?.chat?.id;
        
        const mention = ctx.from.username ? 
            `@${ctx.from.username}` : 
            ctx.from.first_name || 'User';

        if (!chatId) return;

        try {
            await bot.answerCallbackQuery(ctx.id);
        } catch (error) {
            console.error('Error acknowledging callback:', error);
        }

        const tokenData = await getToken(listingId);
        if (!tokenData) {
            await bot.sendMessage(chatId, `${mention}; Token data not found.`);
            return;
        }

        switch(action) {
            case 'buy':
                const suiAmount = parseFloat(amount);
                const processingMsg = await bot.sendMessage(
                    chatId, 
                    `🔄 ${mention}; Attempting to buy ${suiAmount} SUI worth of ${tokenData.name}...`
                );
                
                try {
                    const success = await buyToken(
                        tokenData.token_address,
                        suiAmount,
                        0 // minOutput
                    );

                    await bot.deleteMessage(chatId, processingMsg.message_id);
                    
                    if (success) {
                        await bot.sendMessage(
                            chatId, 
                            `✅ ${mention}; Successfully bought ${suiAmount} SUI worth of ${tokenData.name}`, 
                            { parse_mode: 'Markdown' }
                        );
                    } else {
                        await bot.sendMessage(
                            chatId, 
                            `❌ ${mention}; Transaction failed. Please check your SUI balance and try again.`
                        );
                    }
                } catch (error) {
                    console.error('Error processing buy:', error);
                    await bot.deleteMessage(chatId, processingMsg.message_id);
                    await bot.sendMessage(
                        chatId, 
                        `❌ ${mention}; Error processing buy order. Please try again.`
                    );
                }
                break;

            case 'sell':
                const sellPercentage = parseInt(amount);
                const sellMsg = await bot.sendMessage(
                    chatId, 
                    `🔄 ${mention}; Attempting to sell ${sellPercentage}% of ${tokenData.name}...`
                );
                
                try {
                    const result = await sellTokens(
                        tokenData.token_address,
                        sellPercentage
                    );

                    await bot.deleteMessage(chatId, sellMsg.message_id);
                    
                    if (result.success) {
                        // Wait 2 seconds before checking balance
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        const percentage = await getTokenBalance(tokenData.token_address);
                        await bot.sendMessage(
                            chatId,
                            `✅ ${mention} successfully sold ${sellPercentage}%\n` +
                            `\`${escapeMarkdown(tokenData.token_address)}\`\n` +
                            `Remaining balance: ${percentage.toFixed(2)}% of total supply`,
                            { parse_mode: 'Markdown' }
                        );
                    } else {
                        await bot.sendMessage(
                            chatId, 
                            `❌ ${mention}; Transaction failed. Please try again.`
                        );
                    }
                } catch (error) {
                    console.error('Error processing sell:', error);
                    await bot.deleteMessage(chatId, sellMsg.message_id);
                    await bot.sendMessage(
                        chatId, 
                        `❌ ${mention}; Error processing sell order. Please try again.`
                    );
                }
                break;

            case 'balance':
                try {
                    const percentage = await getTokenBalance(tokenData.token_address);
                    await bot.sendMessage(
                        chatId,
                        `🏦 ${mention}; You own ${percentage.toFixed(2)}% of ${tokenData.name} total supply`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (error) {
                    console.error('Error getting balance:', error);
                    await bot.sendMessage(
                        chatId,
                        `❌ ${mention}; Error retrieving balance. Please try again.`
                    );
                }
                break;
        }
    } catch (error) {
        console.error('Error handling button press:', error);
    }
});

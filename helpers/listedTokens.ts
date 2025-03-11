import fs from 'fs';
import path from 'path';
import proxyAxios from '../proxy/proxyAxios';
import { retrieveEnvVariable } from '../utils/utils';

interface TokenMetadata {
    decimals: number;
    name: string;
    symbol: string;
    description: string;
    iconUrl: string;
    id: string;
}

interface TurbosToken {
    token_address: string;
    bonding_curve: string;
    created_at: string;
    created_by: string;
    deployment_fee: string;
    description: string;
    full_updated: boolean;
    is_completed: boolean;
    lp_type: number;
    market_cap_sui: number;
    market_cap_usd: number;
    name: string;
    pool_id: string;
    real_sui_reserves: string;
    real_token_reserves: string;
    remain_token_reserves: string;
    symbol: string;
    telegram: string;
    token_metadata: TokenMetadata;
    token_price_sui: number;
    token_price_usd: number;
    token_supply: string;
    twitter: string;
    updated_at: string;
    uri: string;
    virtual_sui_reserves: string;
    virtual_token_reserves: string;
    volume_24h_sui: number;
    volume_24h_usd: number;
    volume_sui: string;
    volume_usd: string;
    website: string;
    king_at?: number;
    clmm_pool_id?: string;
}

interface TurbosResponse {
    total: number;
    data: TurbosToken[];
}

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const LISTED_TOKENS_PATH = path.join(dataDir, 'listed_tokens.json');
const DISCORD_WEBHOOK_URL = retrieveEnvVariable('DISCORD_WEBHOOK_URL');

async function sendDiscordNotification(token: TurbosToken) {
    const movepumpLink = `https://movepump.com/token/${token.token_address}`;
    const explorerLink = `https://suivision.xyz/token/${token.token_address}`;
    const turbosLink = `https://app.turbos.finance/fun/#/fun/${token.token_address}`;

    const formattedMarketCap = token.market_cap_usd.toLocaleString('en-US', {
        maximumFractionDigits: 0
    });

    const embed = {
        title: `🚀 New Token Launched: ${token.name}`,
        description: `**Symbol:** [${token.symbol}](${turbosLink})
**Explorer:** [Link](${explorerLink})
**Contract:** [${token.token_address}](${explorerLink})
**Market Cap:** $${formattedMarketCap}`,
        color: 0xFFFF00,
        timestamp: new Date(token.created_at).toISOString(),
        thumbnail: {
            url: token.token_metadata.iconUrl
        }
    };

    const payload = {
        embeds: [embed]
    };

    try {
        const response = await proxyAxios.post(DISCORD_WEBHOOK_URL, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.status !== 200 && response.status !== 204) {
            throw new Error(`Error status: ${response.status}`);
        }
        
        console.log(`Notification sent successfully for launched token: ${token.name}`);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error sending Discord notification:', errorMessage);
    }
}

// Add a flag to track if this is the first run
let isFirstRun = true;

export async function fetchAndStoreTurbosTokens(): Promise<void> {
    try {
        const response = await proxyAxios.get<TurbosResponse>(
            'https://api.turbos.finance/fun/pools',
            {
                params: {
                    search: '',
                    sort: 'created_at',
                    completed: true,
                    page: 1,
                    pageSize: 24,
                    direction: 'desc'
                }
            }
        );

        const existingTokens = getListedTokens();
        let newTokens = response.data.data.filter(token => 
            !existingTokens.some(existing => existing.token_address === token.token_address)
        );

        if (isFirstRun) {
            // On first run, sort tokens by creation time (oldest first)
            newTokens.sort((a, b) => 
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            isFirstRun = false;
        } else {
            // On subsequent runs, only send notifications for truly new tokens
            // and keep them in reverse chronological order (newest first)
            newTokens.sort((a, b) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
        }

        // Send notifications for new tokens
        for (const token of newTokens) {
            await sendDiscordNotification(token);
        }

        // Store the response in the data directory
        fs.writeFileSync(
            LISTED_TOKENS_PATH,
            JSON.stringify(response.data, null, 2)
        );

    } catch (error) {
        console.error('Error fetching Turbos tokens:', error);
    }
}

export function getListedTokens(): TurbosToken[] {
    try {
        if (!fs.existsSync(LISTED_TOKENS_PATH)) {
            // If file doesn't exist, create it with empty data structure
            const emptyData = {
                total: 0,
                data: []
            };
            fs.writeFileSync(LISTED_TOKENS_PATH, JSON.stringify(emptyData, null, 2));
            return [];
        }
        
        const data = fs.readFileSync(LISTED_TOKENS_PATH, 'utf8');
        if (!data || data.trim() === '') {
            // If file is empty, initialize it
            const emptyData = {
                total: 0,
                data: []
            };
            fs.writeFileSync(LISTED_TOKENS_PATH, JSON.stringify(emptyData, null, 2));
            return [];
        }

        const response: TurbosResponse = JSON.parse(data);
        return response.data;
    } catch (error) {
        console.error('Error reading listed tokens:', error);
        // If there's any error, create/reset the file
        const emptyData = {
            total: 0,
            data: []
        };
        fs.writeFileSync(LISTED_TOKENS_PATH, JSON.stringify(emptyData, null, 2));
        return [];
    }
}

// Helper function to get a specific token by address
export function getTokenByAddress(address: string): TurbosToken | undefined {
    const tokens = getListedTokens();
    return tokens.find(token => token.token_address.toLowerCase() === address.toLowerCase());
}

// Helper function to get random interval between 10-30 seconds
function getRandomInterval(): number {
    const minSeconds = 10;
    const maxSeconds = 30;
    return Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
}

// Update tokens with random interval
function scheduleNextUpdate() {
    const interval = getRandomInterval();
    setTimeout(() => {
        fetchAndStoreTurbosTokens()
            .then(() => scheduleNextUpdate())
            .catch(() => scheduleNextUpdate());
    }, interval);
}

// Start the initial fetch and schedule updates
fetchAndStoreTurbosTokens()
    .then(() => scheduleNextUpdate());

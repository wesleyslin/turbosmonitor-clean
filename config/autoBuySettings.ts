export interface AutoBuySettings {
    enabled: boolean;
    maxPreviousLaunches: number;
    minCreatorBalance: number;
    maxCreatorSupply: number;
    buyAmount: number;
    minInitialLiquidity: number;
    maxTokenPrice: number;
    blacklistedCreators: string[];
    requireSocialLinks: boolean;
}

// Add a Set to track tokens we've already tried to buy
const attemptedBuys = new Set<string>();

// Default settings
export const defaultSettings: AutoBuySettings = {
    enabled: false,
    maxPreviousLaunches: 4,    // Only first launches
    minCreatorBalance: 0,     // Min 50 SUI balance
    maxCreatorSupply: 10,      // Max 10% creator supply
    buyAmount: 1,              // Buy 1 SUI worth
    minInitialLiquidity: 0,  // Min 100 SUI liquidity
    maxTokenPrice: 0,          // 0 means no limit
    blacklistedCreators: [],   // Empty blacklist by default
    requireSocialLinks: true   // Require social links by default
};

let currentSettings: AutoBuySettings = { ...defaultSettings };

export function toggleAutoBuy(enabled: boolean): void {
    currentSettings.enabled = enabled;
    console.log(`Auto-buy ${enabled ? 'enabled' : 'disabled'}`);
}

export function updateSettings(newSettings: Partial<AutoBuySettings>): void {
    currentSettings = { ...currentSettings, ...newSettings };
    console.log('Updated auto-buy settings:', currentSettings);
}

export function getSettings(): AutoBuySettings {
    return { ...currentSettings };
}

function isValidTwitterLink(link: string | undefined): boolean {
    if (!link) return false;
    const twitterRegex = /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]{1,15}\/?$/;
    return twitterRegex.test(link);
}

function isValidTelegramLink(link: string | undefined): boolean {
    if (!link) return false;
    const telegramRegex = /^(https?:\/\/)?(www\.)?t\.me\/[a-zA-Z0-9_]{5,}\/?$/;
    return telegramRegex.test(link);
}

function isValidWebsite(link: string | undefined): boolean {
    if (!link) return false;
    const websiteRegex = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w-./?%&=]*)?$/;
    return websiteRegex.test(link);
}

function hasValidSocialLinks(socialLinks: {
    twitter?: string;
    telegram?: string;
    website?: string;
}): boolean {
    let validLinksCount = 0;

    if (isValidTwitterLink(socialLinks.twitter)) validLinksCount++;
    if (isValidTelegramLink(socialLinks.telegram)) validLinksCount++;
    if (isValidWebsite(socialLinks.website)) validLinksCount++;

    return validLinksCount >= 2;  // At least 2 valid social links
}

const BLACKLISTED_WORDS = [
    'eth',
    'ethereum',
    'sol',
    'solana',
    'btc',
    'bitcoin',
    'avax',
    'avalanche',
    'bsc',
    'binance',
    'polygon',
    'matic',
    'bridge',
    'migration',
    'v2',
    'relaunch'
];

function containsBlacklistedWords(text: string | undefined): boolean {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return BLACKLISTED_WORDS.some(word => lowerText.includes(word.toLowerCase()));
}

function hasBlacklistedContent(tokenMetrics: {
    description?: string;
    twitter?: string;
    telegram?: string;
    website?: string;
}): boolean {
    return containsBlacklistedWords(tokenMetrics.description) ||
           containsBlacklistedWords(tokenMetrics.twitter) ||
           containsBlacklistedWords(tokenMetrics.telegram) ||
           containsBlacklistedWords(tokenMetrics.website);
}

export function meetsAutoBuyCriteria(tokenMetrics: {
    previousLaunches: number;
    creatorBalance: number;
    creatorSupply: number;
    creatorAddress: string;
    initialLiquidity?: number;
    tokenPrice?: number;
    twitter?: string;
    telegram?: string;
    website?: string;
    description?: string;
    tokenAddress: string;
}): boolean {
    const settings = getSettings();
    if (!settings.enabled) return false;

    // Check if we've already attempted to buy this token
    if (attemptedBuys.has(tokenMetrics.tokenAddress)) {
        console.log('🔄 Already attempted to buy this token, skipping');
        return false;
    }

    // Add token to attempted buys before checking criteria
    attemptedBuys.add(tokenMetrics.tokenAddress);

    // Check for blacklisted words
    if (hasBlacklistedContent(tokenMetrics)) {
        console.log('❌ Token contains blacklisted words');
        return false;
    }

    // Check social links if required
    if (settings.requireSocialLinks) {
        const hasSocialLinks = hasValidSocialLinks({
            twitter: tokenMetrics.twitter,
            telegram: tokenMetrics.telegram,
            website: tokenMetrics.website
        });
        
        if (!hasSocialLinks) {
            console.log('❌ Token does not meet social links criteria');
            return false;
        }
    }

    return (
        tokenMetrics.previousLaunches <= settings.maxPreviousLaunches &&
        tokenMetrics.creatorBalance >= settings.minCreatorBalance &&
        tokenMetrics.creatorSupply <= settings.maxCreatorSupply &&
        !settings.blacklistedCreators.includes(tokenMetrics.creatorAddress) &&
        (tokenMetrics.initialLiquidity === undefined || 
            tokenMetrics.initialLiquidity >= settings.minInitialLiquidity) &&
        (settings.maxTokenPrice === 0 || 
            (tokenMetrics.tokenPrice === undefined || 
             tokenMetrics.tokenPrice <= settings.maxTokenPrice))
    );
}

// Add function to clear attempted buys (useful for testing)
export function clearAttemptedBuys(): void {
    attemptedBuys.clear();
}
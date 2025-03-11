import fs from 'fs';
import path from 'path';

const TOKEN_FILE = path.join(__dirname, '../data/tokens.json');

interface TokenData {
    name: string;
    symbol: string;
    type: string;
}

interface TokenStorage {
    [key: string]: {
        poolId: string;
        data: TokenData;
        timestamp: number;
    };
}

export function loadTokens(): TokenStorage {
    try {
        const dataDir = path.dirname(TOKEN_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        if (!fs.existsSync(TOKEN_FILE)) {
            fs.writeFileSync(TOKEN_FILE, '{}');
            return {};
        }
        return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    } catch (error) {
        console.error('Error loading tokens:', error);
        return {};
    }
}

function saveTokens(tokens: TokenStorage): void {
    try {
        const dataDir = path.dirname(TOKEN_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    } catch (error) {
        console.error('Error saving tokens:', error);
        console.error('Attempted to save to:', TOKEN_FILE);
    }
}

export function storeTokenData(listingId: string, poolId: string, data: TokenData): void {
    const tokens = loadTokens();
    
    // Check if a token with this poolId already exists
    const existingEntry = Object.entries(tokens).find(([_, token]) => 
        (token as { poolId: string }).poolId === poolId
    );
    
    if (existingEntry) {
        // Update existing entry instead of creating a new one
        tokens[existingEntry[0]] = {
            poolId,
            data,
            timestamp: Date.now()
        };
    } else {
        // Create new entry only if token doesn't exist
        tokens[listingId] = {
            poolId,
            data,
            timestamp: Date.now()
        };
    }
    
    saveTokens(tokens);
}

export function isTokenDuplicate(poolId: string): boolean {
    const tokens = loadTokens();
    return Object.values(tokens).some(token => 
        (token as { poolId: string }).poolId === poolId
    );
}

export function getTokenData(identifier: string): { poolId: string; data: TokenData; timestamp: number } | null {
    const tokens = loadTokens();
    
    // First try to find by listingId
    if (tokens[identifier]) {
        return tokens[identifier];
    }
    
    // If not found by listingId, try to find by poolId or type
    const entry = Object.entries(tokens).find(([_, token]) => 
        (token as { poolId: string; data: TokenData }).poolId === identifier || 
        (token as { poolId: string; data: TokenData }).data.type === identifier
    );
    
    if (entry) {
        return entry[1];
    }

    // If still not found, try to find by token type (case insensitive)
    const typeEntry = Object.entries(tokens).find(([_, token]) => 
        (token as { poolId: string; data: TokenData }).data.type.toLowerCase() === identifier.toLowerCase()
    );

    return typeEntry ? typeEntry[1] : null;
}

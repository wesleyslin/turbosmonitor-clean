import Database from 'better-sqlite3';
import path from 'path';

export interface Token {
    listing_id: string;
    token_address: string;
    name: string;
    symbol: string;
    pool_id: string;
    creator_address: string;
    description: string;
    created_at: string;
    uri: string;
    owned_token: boolean;
    twitter?: string;
    telegram?: string;
    website?: string;
}

interface TokenRow {
    listing_id: string;
    token_address: string;
    name: string;
    symbol: string;
    pool_id: string;
    creator_address: string;
    description: string;
    created_at: string;
    uri: string;
    owned_token: number;
    twitter: string | null;
    telegram: string | null;
    website: string | null;
}

let db: Database.Database | null = null;

export async function initializeDatabase() {
    if (db) return db;  // Return existing connection if it exists
    
    const dbPath = path.join(process.cwd(), 'data', 'turbos.db');
    console.log('Opening database at:', dbPath);
    db = new Database(dbPath);

    db.exec(`
        CREATE TABLE IF NOT EXISTS tokens (
            listing_id TEXT PRIMARY KEY,
            token_address TEXT UNIQUE,
            name TEXT,
            symbol TEXT,
            pool_id TEXT,
            creator_address TEXT,
            description TEXT,
            created_at TEXT,
            uri TEXT,
            owned_token INTEGER DEFAULT 0,
            twitter TEXT,
            telegram TEXT,
            website TEXT
        )
    `);

    return db;
}

export async function getDatabase() {
    return db || initializeDatabase();
}

export async function upsertToken(token: Token) {
    const db = await getDatabase();
    
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO tokens (
            listing_id,
            token_address,
            name,
            symbol,
            pool_id,
            creator_address,
            description,
            created_at,
            uri,
            owned_token,
            twitter,
            telegram,
            website
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        token.listing_id,
        token.token_address,
        token.name,
        token.symbol,
        token.pool_id,
        token.creator_address,
        token.description,
        token.created_at,
        token.uri,
        token.owned_token ? 1 : 0,
        token.twitter || null,
        token.telegram || null,
        token.website || null
    );
}

function convertRowToToken(row: TokenRow): Token {
    return {
        ...row,
        owned_token: Boolean(row.owned_token),
        twitter: row.twitter || undefined,
        telegram: row.telegram || undefined,
        website: row.website || undefined
    };
}

export async function getToken(listingId: string): Promise<Token | null> {
    const db = await getDatabase();
    
    const stmt = db.prepare('SELECT * FROM tokens WHERE listing_id = ?');
    const result = stmt.get(listingId) as TokenRow | undefined;

    if (!result) return null;

    return convertRowToToken(result);
}

export function generateListingId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function getTokenByAddress(tokenAddress: string): Promise<Token | null> {
    const db = await getDatabase();
    
    const stmt = db.prepare('SELECT * FROM tokens WHERE token_address = ?');
    const result = stmt.get(tokenAddress) as TokenRow | undefined;

    if (!result) return null;

    return convertRowToToken(result);
}

export async function updateTokenOwnership(tokenAddress: string, owned: boolean) {
    const db = await getDatabase();
    
    const stmt = db.prepare(`
        UPDATE tokens 
        SET owned_token = ? 
        WHERE token_address = ?
    `);

    stmt.run(owned ? 1 : 0, tokenAddress);
}

export async function getOwnedTokens(): Promise<Token[]> {
    const db = await getDatabase();
    
    const stmt = db.prepare('SELECT * FROM tokens WHERE owned_token = 1');
    const results = stmt.all() as TokenRow[];

    return results.map(row => convertRowToToken(row));
} 
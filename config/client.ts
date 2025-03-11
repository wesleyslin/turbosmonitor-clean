import { SuiClient, SuiHTTPTransport } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const HTTPS_ENDPOINT = process.env.HTTPS_ENDPOINT;
const WS_ENDPOINT = process.env.WS_ENDPOINT;

if (!HTTPS_ENDPOINT || !WS_ENDPOINT) {
    throw new Error("Environment variables HTTPS_ENDPOINT or WS_ENDPOINT are not set.");
}

// Set WebSocket globally
(global as any).WebSocket = WebSocket;

export const client = new SuiClient({
    transport: new SuiHTTPTransport({
        url: HTTPS_ENDPOINT,
        websocket: {
            url: WS_ENDPOINT
        }
    })
});

// Initialize wallets from private keys
const privateKeys = [
    process.env.PK1,
    process.env.PK2,
    process.env.PK3,
    process.env.PK4
].filter(Boolean) as string[];

export const wallets = privateKeys.map(pk => {
    const keypair = Ed25519Keypair.fromSecretKey(pk);
    return {
        address: keypair.getPublicKey().toSuiAddress(),
        keypair: keypair
    };
});

export const WALLET_ADDRESSES = wallets.map(wallet => wallet.address);

// Export individual wallet objects if needed
export const [WALLET1, WALLET2, WALLET3, WALLET4] = wallets;

// Helper function to get wallet by index
export function getWallet(index: number) {
    if (index < 0 || index >= wallets.length) {
        throw new Error(`Invalid wallet index: ${index}`);
    }
    return wallets[index];
}

// Export common types
export type SuiTransactionBlockResponse = Awaited<ReturnType<typeof client.executeTransactionBlock>>;
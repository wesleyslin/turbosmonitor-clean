import dotenv from 'dotenv';
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { client } from '../config/client';
import { watchNewTokens } from '../transactions/watch';
import { watchSellEvents } from '../helpers/watchCreatorSell';
import { quickHealthCheck } from '../helpers/checkLatency';
import { initializeBot } from '../telegram/telegramBot';
import '../telegram/telegramCommands';
import { fetchAndStoreTurbosTokens } from '../helpers/listedTokens';

dotenv.config();

const TURBOS_PACKAGE = "0x96e1396c8a771c8ae404b86328dc27e7b66af39847a31926980c96dbc1096a15";
const CLOCK_OBJECT = "0x0000000000000000000000000000000000000000000000000000000000000006";
const TURBOS_CONFIG = "0xd86685fc3c3d989385b9311ef55bfc01653105670209ac4276ebb6c83d7df928";

function getRandomizedAmount(baseAmount: number): number {
    const deviation = 0.2;
    const minFactor = 1 - deviation;
    const maxFactor = 1 + deviation;
    const factor = minFactor + Math.random() * (maxFactor - minFactor);
    return Math.round(baseAmount * factor * 100) / 100;
}

function splitAmount(totalAmount: number, numWallets: number): number[] {
    const baseAmount = totalAmount / numWallets;
    let amounts = Array.from({ length: numWallets }, () => getRandomizedAmount(baseAmount));
    
    const sum = amounts.reduce((acc, amount) => acc + amount, 0);
    const adjustment = totalAmount - sum;
    amounts[0] += adjustment;
    return amounts;
}

// Pre-compute shared objects
const SHARED_OBJECTS = {
    turbosPumpConfig: {
        objectId: TURBOS_CONFIG,
        initialSharedVersion: 412321437,
        mutable: true
    },
    clockObject: {
        objectId: CLOCK_OBJECT,
        initialSharedVersion: 1,
        mutable: false
    }
};

// Pre-initialize keypairs
const KEYPAIRS = [
    process.env.PK1, 
    process.env.PK2, 
    process.env.PK3, 
    process.env.PK4
].filter(Boolean).map(pk => Ed25519Keypair.fromSecretKey(pk as string));

async function executeTransaction({ transaction, keypair }: { transaction: Transaction, keypair: Ed25519Keypair }) {
    // Fire and forget - don't wait for confirmation
    client.signAndExecuteTransaction({
        transaction,
        signer: keypair,
        requestType: "WaitForLocalExecution",
        options: { 
            showEffects: false,
            showEvents: false,
            showInput: false,
            showObjectChanges: false,
            showBalanceChanges: false
        }
    }).catch(() => {});  // Ignore errors
    
    return true; // Always return true immediately
}

function prepareTransaction(
    tokenType: string,
    suiAmount: number,
    expectedTokenAmount: number,
    keypair: Ed25519Keypair
) {
    const tx = new Transaction();
    const amount = BigInt(Math.floor(suiAmount * 1e9));
    
    const splitCoinResult = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
    
    tx.moveCall({
        target: `${TURBOS_PACKAGE}::turbospump::buy`,
        typeArguments: [tokenType],
        arguments: [
            tx.sharedObjectRef(SHARED_OBJECTS.turbosPumpConfig),
            splitCoinResult,
            tx.pure.u64(amount),
            tx.pure.u64(expectedTokenAmount),
            tx.pure.bool(true),
            tx.sharedObjectRef(SHARED_OBJECTS.clockObject)
        ],
    });
    
    tx.setGasBudget(21_000_000);
    tx.setGasPrice(900);
    return { transaction: tx, keypair };
}

export async function buyToken(tokenAddress: string, suiAmount: number, minOutput: number) {
    const startTime = Date.now();
    try {
        // Pre-compute amounts
        const amounts = splitAmount(suiAmount, KEYPAIRS.length);
        
        // Fire transactions immediately
        KEYPAIRS.forEach((keypair, index) => {
            const tx = new Transaction();
            const amount = BigInt(Math.floor(amounts[index] * 1e9));
            
            const splitCoinResult = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
            tx.moveCall({
                target: `${TURBOS_PACKAGE}::turbospump::buy`,
                typeArguments: [tokenAddress],
                arguments: [
                    tx.sharedObjectRef(SHARED_OBJECTS.turbosPumpConfig),
                    splitCoinResult,
                    tx.pure.u64(amount),
                    tx.pure.u64(minOutput),
                    tx.pure.bool(true),
                    tx.sharedObjectRef(SHARED_OBJECTS.clockObject)
                ],
            });
            
            tx.setGasBudget(20_000_000);
            tx.setGasPrice(800);

            // Fire without any checks or waiting
            client.signAndExecuteTransaction({
                transaction: tx,
                signer: keypair,
                requestType: "WaitForLocalExecution",
                options: { 
                    showEffects: false,
                    showEvents: false,
                    showInput: false,
                    showObjectChanges: false,
                    showBalanceChanges: false
                }
            }).catch(() => {});
        });

        console.log(`⚡ Buy txs fired: ${Date.now() - startTime}ms`);
        return true;
    } catch (error) {
        console.error(`❌ Buy failed: ${Date.now() - startTime}ms`);
        return false;
    }
}

async function startBot() {
    try {
        console.log('Starting Turbos Finance Bot...');

        // Initialize Telegram bot first
        await initializeBot();
        console.log('Telegram bot initialized');

        // Check RPC health before starting
        console.log('Checking RPC health...');
        const avgLatency = await quickHealthCheck();
        if (avgLatency === Infinity) {
            throw new Error('RPC is not responding');
        } else if (avgLatency > 1000) {
            console.warn('Warning: High RPC latency detected');
        }

        // Fetch and store listed tokens first
        console.log('Fetching listed tokens...');
        await fetchAndStoreTurbosTokens();

        // Start watching for new tokens
        console.log('Starting token watcher...');
        await watchNewTokens();

        // Start watching for creator sells
        console.log('Starting creator sell watcher...');
        await watchSellEvents();

        console.log('All systems running!');
    } catch (error) {
        console.error('Error starting bot:', error);
        process.exit(1);
    }
}

// Only start the bot once
startBot()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });

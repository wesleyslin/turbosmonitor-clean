import { EventId, SuiEvent, SuiEventFilter, OwnedObjectRef } from '@mysten/sui/client';
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { client } from '../config/client';
import { upsertToken, getTokenByAddress, initializeDatabase, generateListingId } from '../helpers/database';
import { sendTelegramListing } from "../telegram/telegramMessages";
import dotenv from 'dotenv';
import { buyToken } from './snipe';
import { meetsAutoBuyCriteria, getSettings } from '../config/autoBuySettings';
import { getTokenBalance } from '../helpers/getTokenBalance';
import { bot, TG_CHAT_ID } from '../telegram/telegramBot';

dotenv.config();

const TURBOS_PACKAGE = "0x96e1396c8a771c8ae404b86328dc27e7b66af39847a31926980c96dbc1096a15";

// Import shared objects and keypairs from snipe.ts
const SHARED_OBJECTS = {
    turbosPumpConfig: {
        objectId: "0xd86685fc3c3d989385b9311ef55bfc01653105670209ac4276ebb6c83d7df928",
        initialSharedVersion: 412321437,
        mutable: true
    },
    clockObject: {
        objectId: "0x0000000000000000000000000000000000000000000000000000000000000006",
        initialSharedVersion: 1,
        mutable: false
    }
};

// Import keypairs
const KEYPAIRS = [
    process.env.PK1, 
    process.env.PK2, 
    process.env.PK3, 
    process.env.PK4
].filter(Boolean).map(pk => Ed25519Keypair.fromSecretKey(pk as string));

type SuiEventsCursor = EventId | null | undefined;

// Define the event interface
interface TokenCreatedEvent {
    name: string;
    symbol: string;
    uri: string;
    description: string;
    twitter: string;
    telegram: string;
    website: string;
    token_address: string;
    bonding_curve: string;
    pool_id: string;
    created_by: string;
    real_sui_reserves: string;
    real_token_reserves: string;
    virtual_sui_reserves: string;
    virtual_token_reserves: string;
    remain_token_reserves: string;
    is_completed: boolean;
    deployment_fee: string;
    token_supply: string;
    lp_type: number;
}

// Add this interface at the top with other interfaces
interface CreatedObject {
    owner: {
        Shared?: { initial_shared_version: string }; // Matches shared ownership structure
        AddressOwner?: string; // Matches address ownership structure
        ObjectOwner?: string; // Handle other ownership types
    };
    reference: {
        objectId: string; // Ensure the objectId field exists
    };
}



async function getDeployerBalance(address: string): Promise<number> {
    try {
        const response = await client.getBalance({
            owner: address,
            coinType: '0x2::sui::SUI'
        });
        return Number(response.totalBalance) / 1e9;
    } catch (error) {
        console.error('Error getting deployer balance:', error);
        return 0;
    }
}

async function getPreviousLaunches(address: string): Promise<number> {
    try {
        // Simulating the retrieval of previous launches (as before)
        // Use a custom logic depending on the Sui chain storage capabilities.
        return 0; // Placeholder for previous logic if needed
    } catch (error) {
        console.error('Error getting previous launches:', error);
        return 0;
    }
}

async function processTokenCreationEvent(events: SuiEvent[]) {
    for (const event of events) {
        try {
            const eventData = event.parsedJson as any; // Adjust depending on the event data structure

            const tokenData = {
                name: eventData.name || "",
                symbol: eventData.symbol || "",
                token_address: eventData.token_address || "",
                twitter: eventData.twitter || "",
                telegram: eventData.telegram || "",
                website: eventData.website || "",
                description: eventData.description || "",
                pool_id: eventData.pool_id || "",
                created_by: eventData.created_by || "",
                uri: eventData.uri || ""
            };

            if (!tokenData.name || !tokenData.symbol || !tokenData.token_address) continue;

            const formattedTokenAddress = ensure0xPrefix(tokenData.token_address);
            const formattedCreatorAddress = tokenData.created_by 
                ? ensure0xPrefix(tokenData.created_by) 
                : "Unknown Creator";
            const formattedPoolId = tokenData.pool_id 
                ? ensure0xPrefix(tokenData.pool_id) 
                : "";

            // Check if token already exists
            const existingToken = await getTokenByAddress(formattedTokenAddress);
            if (existingToken) continue;

            // Get creator info
            const creatorInfo = {
                balance: await getDeployerBalance(formattedCreatorAddress),
                previousLaunches: await getPreviousLaunches(formattedCreatorAddress),
                creatorSupply: 0 // Placeholder if not needed
            };

            const tokenMetrics = {
                previousLaunches: creatorInfo.previousLaunches,
                creatorBalance: creatorInfo.balance,
                creatorSupply: creatorInfo.creatorSupply,
                creatorAddress: formattedCreatorAddress,
                twitter: tokenData.twitter,
                telegram: tokenData.telegram,
                website: tokenData.website,
                tokenAddress: formattedTokenAddress
            };

            // Store new token
            const tokenToStore = {
                listing_id: generateListingId(),
                token_address: formattedTokenAddress,
                name: tokenData.name,
                symbol: tokenData.symbol,
                pool_id: formattedPoolId,
                creator_address: formattedCreatorAddress,
                description: tokenData.description,
                created_at: new Date().toISOString(),
                uri: tokenData.uri,
                owned_token: false,
                twitter: tokenData.twitter,
                telegram: tokenData.telegram,
                website: tokenData.website
            };

            if (meetsAutoBuyCriteria(tokenMetrics)) {
                console.log(`🤖 Auto-buy triggered for ${tokenData.name}`);

                try {
                    // First store the token as not owned
                    await upsertToken(tokenToStore);

                    const success = await buyToken(
                        tokenData.token_address,
                        getSettings().buyAmount,
                        0
                    );
                    console.log(`Auto-buy ${success ? 'successful' : 'failed'} for ${tokenData.name}`);

                    // If buy was successful, update the token as owned
                    if (success) {
                        await upsertToken({
                            ...tokenToStore,
                            owned_token: true
                        });
                        console.log(`Updated database: marked ${tokenData.name} as owned`);

                        // Send simple auto-buy notification asynchronously
                        queueMicrotask(async () => {
                            try {
                                const settings = getSettings();
                                const percentage = await getTokenBalance(tokenData.token_address);
                                await bot.sendMessage(
                                    TG_CHAT_ID, 
                                    `✅ Successfully autobought ${tokenData.name} with ${settings.buyAmount} SUI. We own ${percentage.toFixed(2)}% of supply`
                                );
                            } catch (error) {
                                console.error('Error sending auto-buy notification:', error);
                            }
                        });
                    }

                    // Send telegram message after database is updated
                    await sendTelegramListing(tokenToStore.listing_id, creatorInfo);
                } catch (error) {
                    console.error('Auto-buy error:', error);
                    // Still store the token even if buy fails
                    await upsertToken(tokenToStore);
                    await sendTelegramListing(tokenToStore.listing_id, creatorInfo);
                }
            } else {
                // If no auto-buy, just store and notify
                await upsertToken(tokenToStore);
                await sendTelegramListing(tokenToStore.listing_id, creatorInfo);
            }
        } catch (error) {
            console.error("Error processing token creation event:", error);
        }
    }
}

export const watchNewTokens = async () => {
    console.log('Starting token watch...');
    await initializeDatabase();

    const filter: SuiEventFilter = {
        MoveEventType: `${TURBOS_PACKAGE}::turbospump::CreatedEvent`
    };

    let lastProcessedDigest: string | null = null;
    const primaryKeypair = KEYPAIRS[0];

    const processEvents = async () => {
        try {
            const { data } = await client.queryEvents({
                query: filter,
                order: 'descending',
                limit: 1
            });

            if (data.length > 0 && data[0].id.txDigest !== lastProcessedDigest) {
                const eventData = data[0].parsedJson as TokenCreatedEvent;
                if (eventData?.token_address) {
                    console.log('\n=== New Token Detected ===');
                    console.log('Token:', eventData.name);
                    console.log('Address:', eventData.token_address);
                    
                    // Build transaction directly without template
                    const tx = new Transaction();
                    const amount = BigInt(1_000_000_000); // 2 SUI
                    
                    const splitCoinResult = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
                    tx.moveCall({
                        target: `${TURBOS_PACKAGE}::turbospump::buy`,
                        typeArguments: [eventData.token_address],
                        arguments: [
                            tx.sharedObjectRef(SHARED_OBJECTS.turbosPumpConfig),
                            splitCoinResult,
                            tx.pure.u64(amount),
                            tx.pure.u64(0),
                            tx.pure.bool(true),
                            tx.sharedObjectRef(SHARED_OBJECTS.clockObject)
                        ]
                    });
                    
                    tx.setGasBudget(25_000_000);
                    tx.setGasPrice(1000);

                    console.log('Firing buy transaction...');
                    // Fire immediately
                    client.signAndExecuteTransaction({
                        transaction: tx,
                        signer: primaryKeypair,
                        requestType: "WaitForLocalExecution",
                        options: { 
                            showEffects: false,
                            showEvents: false,
                            showInput: false,
                            showObjectChanges: false,
                            showBalanceChanges: false
                        }
                    }).catch((error) => {
                        console.error('Buy transaction failed:', error);
                    });

                    lastProcessedDigest = data[0].id.txDigest;
                    queueMicrotask(() => processTokenCreationEvent([data[0]]));
                }
            }

            setImmediate(processEvents);
        } catch (error) {
            console.error('Error in processEvents:', error);
            setImmediate(processEvents);
        }
    };

    processEvents();
};

function ensure0xPrefix(address: string): string {
    return address.startsWith('0x') ? address : `0x${address}`;
}

function extractTokenType(txData: any): string | null {
    const input = txData.transaction?.data;
    const events = txData.events;
    const effects = txData.effects;

    if (input) {
        const tokenType = input.token_type;
        if (tokenType) {
            return tokenType;
        }
    }

    if (events) {
        for (const event of events) {
            const tokenType = event.parsedJson?.token_type;
            if (tokenType) {
                return tokenType;
            }
        }
    }

    if (effects) {
        for (const obj of effects.created) {
            const tokenType = obj.reference?.token_type;
            if (tokenType) {
                return tokenType;
            }
        }
    }

    return null;
}

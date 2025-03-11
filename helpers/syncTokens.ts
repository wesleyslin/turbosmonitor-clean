import proxyAxios from "../proxy/proxyAxios";
import { 
    initializeDatabase, 
    upsertToken,
    getTokenByAddress,
    generateListingId
} from '../helpers/database';
import { getTokenBalance } from './getTokenBalance';

const TURBOS_PACKAGE = "0x96e1396c8a771c8ae404b86328dc27e7b66af39847a31926980c96dbc1096a15";
const GRAPHQL_URL = "https://sui-mainnet.mystenlabs.com/graphql";

// Helper function to ensure 0x prefix
function ensure0xPrefix(address: string): string {
    return address.startsWith('0x') ? address : `0x${address}`;
}

export async function syncTokens() {
    try {
        await initializeDatabase();
        console.log('Starting initial token database sync...');

        const response = await proxyAxios.post(GRAPHQL_URL, {
            query: `{
                transactionBlocks(
                    filter: {
                        function: "${TURBOS_PACKAGE}::turbospump::create"
                    }
                    last: 30
                ) {
                    nodes {
                        sender {
                            address
                        }
                        effects {
                            events {
                                nodes {
                                    contents {
                                        data
                                    }
                                    sender {
                                        address
                                    }
                                }
                            }
                        }
                    }
                }
            }`
        });

        const transactions = response.data?.data?.transactionBlocks?.nodes;
        if (!transactions || transactions.length === 0) {
            console.log('No tokens found in GraphQL query');
            return;
        }

        console.log(`Found ${transactions.length} transactions to process`);
        let totalProcessed = 0;
        let totalAdded = 0;
        let totalSkipped = 0;

        for (const tx of transactions) {
            try {
                const events = tx.effects?.events?.nodes;
                if (!events || events.length === 0) continue;

                for (const event of events) {
                    const eventData = event.contents?.data;
                    if (!eventData?.Struct) continue;

                    // Extract token data including social links
                    const tokenData = {
                        token_address: eventData.Struct.find(
                            (item: any) => item.name === "token_address"
                        )?.value?.String,
                        name: eventData.Struct.find(
                            (item: any) => item.name === "name"
                        )?.value?.String,
                        symbol: eventData.Struct.find(
                            (item: any) => item.name === "symbol"
                        )?.value?.String,
                        description: eventData.Struct.find(
                            (item: any) => item.name === "description"
                        )?.value?.String,
                        pool_id: eventData.Struct.find(
                            (item: any) => item.name === "pool_id"
                        )?.value?.ID,
                        created_by: eventData.Struct.find(
                            (item: any) => item.name === "created_by"
                        )?.value?.Address,
                        uri: eventData.Struct.find(
                            (item: any) => item.name === "uri"
                        )?.value?.String,
                        twitter: eventData.Struct.find(
                            (item: any) => item.name === "twitter"
                        )?.value?.String || "",
                        telegram: eventData.Struct.find(
                            (item: any) => item.name === "telegram"
                        )?.value?.String || "",
                        website: eventData.Struct.find(
                            (item: any) => item.name === "website"
                        )?.value?.String || ""
                    };

                    if (!tokenData.name) continue;

                    // Format addresses
                    const formattedTokenAddress = ensure0xPrefix(tokenData.token_address);
                    const formattedCreatorAddress = tokenData.created_by ? 
                        "0x" + Buffer.from(tokenData.created_by).toString('hex') : 
                        "Unknown Creator";
                    const formattedPoolId = tokenData.pool_id ? 
                        ensure0xPrefix(Buffer.from(tokenData.pool_id).toString('hex')) : 
                        undefined;

                    // Check if token already exists
                    const existingToken = await getTokenByAddress(formattedTokenAddress);
                    if (existingToken) {
                        totalSkipped++;
                        continue;
                    }

                    // Store token in database
                    try {
                        const tokenBalance = await getTokenBalance(formattedTokenAddress);
                        const isOwned = tokenBalance > 0;

                        await upsertToken({
                            listing_id: generateListingId(),
                            token_address: formattedTokenAddress,
                            name: tokenData.name,
                            symbol: tokenData.symbol,
                            pool_id: formattedPoolId || "",
                            creator_address: formattedCreatorAddress,
                            description: tokenData.description || "",
                            created_at: new Date().toISOString(),
                            uri: tokenData.uri || "",
                            owned_token: isOwned,
                            twitter: tokenData.twitter,
                            telegram: tokenData.telegram,
                            website: tokenData.website
                        });
                        
                        if (isOwned) {
                            console.log(`Added owned token: ${tokenData.name} (${tokenData.symbol}) with ${tokenBalance}% ownership`);
                        } else {
                            console.log(`Added token: ${tokenData.name} (${tokenData.symbol})`);
                        }
                        totalAdded++;
                    } catch (error) {
                        console.error(`Failed to add token ${tokenData.name}:`, error);
                    }

                    totalProcessed++;
                }
            } catch (error) {
                console.error("Error processing transaction:", error);
                continue;
            }
        }

        console.log('\nSync Summary:');
        console.log(`Total transactions found: ${transactions.length}`);
        console.log(`Total tokens processed: ${totalProcessed}`);
        console.log(`Total tokens added: ${totalAdded}`);
        console.log(`Total tokens skipped: ${totalSkipped}`);
        console.log('Sync complete!');
    } catch (error) {
        console.error('Error syncing tokens:', error);
    }
}

// Add this at the bottom to run the function
console.log('Starting sync process...');
syncTokens()
    .then(() => {
        console.log('Sync process finished successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Error in sync process:', error);
        process.exit(1);
    });


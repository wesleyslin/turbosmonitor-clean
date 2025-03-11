import { sellTokens } from '../transactions/sell';
import { getOwnedTokens, updateTokenOwnership } from '../helpers/database';
import proxyAxios from "../proxy/proxyAxios";
import dotenv from 'dotenv';

dotenv.config();

const TURBOS_PACKAGE = "0x96e1396c8a771c8ae404b86328dc27e7b66af39847a31926980c96dbc1096a15";
const GRAPHQL_URL = "https://sui-mainnet.mystenlabs.com/graphql";

let lastProcessedDigest: string | null = null;

interface StructField {
    name: string;
    value: {
        String?: string;
        Address?: number[];
        Bool?: boolean;
        Number?: string;
        ID?: number[];
    };
}

async function watchForSellEvents() {
    try {
        const query = `{
            transactionBlocks(
                filter: {
                    function: "${TURBOS_PACKAGE}::turbospump::sell"
                }
                last: 5
            ) {
                nodes {
                    digest
                    sender {
                        address
                    }
                    effects {
                        events {
                            nodes {
                                contents {
                                    data
                                }
                            }
                        }
                    }
                }
            }
        }`;
        
        const response = await proxyAxios.post(GRAPHQL_URL, { query });

        const transactions = response.data?.data?.transactionBlocks?.nodes;
        if (!transactions || transactions.length === 0) {
            return;
        }

        for (const tx of transactions) {
            if (tx.digest === lastProcessedDigest) {
                continue;
            }

            const events = tx.effects?.events?.nodes || [];
            for (const event of events) {
                const eventData = event.contents?.data?.Struct;
                if (!eventData) continue;

                const fields = eventData as StructField[];
                const isSell = fields.find(f => f.name === "is_buy")?.value?.Bool === false;
                if (!isSell) continue;

                const tokenAddress = fields.find(f => f.name === "token_address")?.value?.String;
                const seller = tx.sender?.address;

                if (tokenAddress && seller) {
                    handleSellEvent(seller, tokenAddress).catch(() => {});
                }
            }

            lastProcessedDigest = tx.digest;
        }

    } catch (error) {
        console.error('Error watching for sell events:', error);
    }

    setTimeout(watchForSellEvents, 100);
}

async function handleSellEvent(seller: string, tokenAddress: string) {
    const startTime = Date.now();
    const ownedTokens = await getOwnedTokens();
    const matchingToken = ownedTokens.find(token => 
        token.creator_address.toLowerCase() === seller.toLowerCase()
    );

    if (!matchingToken) {
        return;
    }

    console.log(`\n🚨 CREATOR SELL DETECTED!`);
    console.log(`Token: ${matchingToken.name} (${matchingToken.symbol})`);
    console.log(`Creator Address: ${matchingToken.creator_address}`);

    try {
        console.log('Executing emergency sell...');
        sellTokens(matchingToken.token_address, 100).catch(() => {});
        console.log(`⚡ Emergency sell initiated in ${Date.now() - startTime}ms`);
        
        queueMicrotask(async () => {
            try {
                await updateTokenOwnership(matchingToken.token_address, false);
            } catch {}
        });
    } catch (error) {
        console.error(`Error initiating sell:`, error);
    }
}

export async function watchSellEvents() {
    console.log('Starting sell event watch...');
    watchForSellEvents();
}

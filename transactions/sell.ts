import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { client, wallets } from '../config/client';
import { updateTokenOwnership } from '../helpers/database';
import { getTokenBalance } from '../helpers/getTokenBalance';

const TURBOS_PACKAGE = "0x96e1396c8a771c8ae404b86328dc27e7b66af39847a31926980c96dbc1096a15";
const TURBOS_CONFIG = "0xd86685fc3c3d989385b9311ef55bfc01653105670209ac4276ebb6c83d7df928";
const CLOCK_OBJECT = "0x0000000000000000000000000000000000000000000000000000000000000006";

async function executeSellTransaction(
    tokenType: string,
    amount: bigint,
    privateKey: string
): Promise<void> {
    try {
        const keypair = Ed25519Keypair.fromSecretKey(privateKey);
        const tx = new Transaction();

        // Get coins for this wallet
        const coins = await client.getCoins({
            owner: keypair.getPublicKey().toSuiAddress(),
            coinType: tokenType
        });

        if (!coins.data || coins.data.length === 0) {
            return;
        }

        // Sort coins by balance (highest first)
        const sortedCoins = coins.data.sort((a, b) => 
            Number(BigInt(b.balance) - BigInt(a.balance))
        );

        // Find a coin with sufficient balance
        const suitableCoin = sortedCoins.find(coin => BigInt(coin.balance) >= amount);
        let coinToUse;

        if (suitableCoin) {
            coinToUse = tx.object(suitableCoin.coinObjectId);
        } else {
            // If no single coin has enough balance, merge coins
            const primaryCoin = tx.object(sortedCoins[0].coinObjectId);
            const coinsToMerge = sortedCoins.slice(1).map(coin => 
                tx.object(coin.coinObjectId)
            );
            
            tx.mergeCoins(primaryCoin, coinsToMerge);
            coinToUse = primaryCoin;
        }

        // Split exact amount to sell
        const splitCoin = tx.splitCoins(coinToUse, [tx.pure.u64(amount)]);

        tx.moveCall({
            target: `${TURBOS_PACKAGE}::turbospump::sell`,
            typeArguments: [tokenType],
            arguments: [
                tx.sharedObjectRef({
                    objectId: TURBOS_CONFIG,
                    initialSharedVersion: 412321437,
                    mutable: true
                }),
                splitCoin,
                tx.pure.u64(amount),
                tx.pure.u64(0),
                tx.pure.bool(true),
                tx.sharedObjectRef({
                    objectId: CLOCK_OBJECT,
                    initialSharedVersion: 1,
                    mutable: false
                })
            ],
        });

        tx.setGasBudget(50000000);

        // Fire and forget
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

    } catch {
        return;
    }
}

export async function sellTokens(
    tokenType: string,
    sellPercentage: number
): Promise<{ success: boolean; digests: string[] }> {
    const startTime = Date.now();
    try {
        const balances = await Promise.all(
            wallets.map(async wallet => {
                const balance = await client.getBalance({
                    owner: wallet.address,
                    coinType: tokenType
                });
                return {
                    address: wallet.address,
                    balance: BigInt(balance.totalBalance),
                    privateKey: wallet.keypair.getSecretKey()
                };
            })
        );

        const totalBalance = balances.reduce((sum, wallet) => sum + wallet.balance, BigInt(0));
        const totalAmountToSell = (totalBalance * BigInt(sellPercentage)) / BigInt(100);

        // Fire all sell transactions without waiting
        balances
            .filter(wallet => wallet.balance > 0)
            .forEach(wallet => {
                const walletSellAmount = wallet.balance >= totalAmountToSell ? 
                    totalAmountToSell : 
                    wallet.balance;
                executeSellTransaction(tokenType, walletSellAmount, wallet.privateKey);
            });

        console.log(`⚡ Sell: ${Date.now() - startTime}ms`);

        // Update ownership asynchronously
        queueMicrotask(async () => {
            try {
                const remainingBalance = await getTokenBalance(tokenType);
                if (remainingBalance < 0.1) {
                    await updateTokenOwnership(tokenType, false);
                }
            } catch {}
        });

        return { success: true, digests: [] };
    } catch {
        return { success: false, digests: [] };
    }
}

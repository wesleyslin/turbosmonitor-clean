import { client, WALLET_ADDRESSES } from '../config/client';
import { getToken } from './database';

export async function getTokenBalance(tokenAddress: string): Promise<number> {
    try {
        // Ensure token address is properly formatted
        const formattedTokenAddress = tokenAddress.includes('::') ? 
            tokenAddress : 
            `${tokenAddress}::${tokenAddress.split('::')[1] || ''}`;

        // Add delay to allow transaction to process
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Fetch balances for all wallets and sum them
        const balances = await Promise.all(
            WALLET_ADDRESSES.map(async address => {
                try {
                    const balance = await client.getBalance({
                        owner: address,
                        coinType: formattedTokenAddress
                    });
                    return BigInt(balance.totalBalance);
                } catch (error) {
                    console.log(`Skipping balance check for wallet ${address}`);
                    return BigInt(0);
                }
            })
        );

        // Sum up all balances
        const totalBalance = balances.reduce(
            (sum, balance) => sum + balance, 
            BigInt(0)
        );

        const totalSupply = BigInt("10000000000000000");
        const ownedPercentage = Number((totalBalance * BigInt(1000000000) * BigInt(100)) / totalSupply) / 1000000000;
        
        return Number(ownedPercentage.toFixed(2));
    } catch (error) {
        console.log('Error getting token balances, returning 0');
        return 0;
    }
}

// Add a helper function to get balance by listing ID
export async function getTokenBalanceByListingId(listingId: string): Promise<number> {
    const tokenData = await getToken(listingId);
    if (!tokenData) {
        throw new Error('Token not found');
    }
    return getTokenBalance(tokenData.token_address);
}
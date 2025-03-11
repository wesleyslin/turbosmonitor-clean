import { quickHealthCheck } from '../helpers/checkLatency';
import { client } from '../config/client';
import dotenv from 'dotenv';
import http from 'http';

dotenv.config();

async function testBasicConnection(url: string): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            console.log('Basic connection response code:', res.statusCode);
            resolve(true);
        });

        req.on('error', (error) => {
            console.error('Basic connection error:', error.message);
            resolve(false);
        });

        req.setTimeout(5000, () => {
            console.error('Connection timeout');
            req.destroy();
            resolve(false);
        });
    });
}

async function main() {
    console.log('Starting RPC health check...');
    const endpoint = process.env.HTTPS_ENDPOINT;
    console.log('Using RPC endpoint:', endpoint);

    if (!endpoint) {
        console.error('ERROR: HTTPS_ENDPOINT is not set in .env file');
        process.exit(1);
    }

    // First test basic connectivity
    console.log('\nTesting basic connectivity...');
    const isReachable = await testBasicConnection(endpoint);
    
    if (!isReachable) {
        console.error('❌ Cannot establish basic connection to the endpoint');
        console.log('\nPossible issues:');
        console.log('1. RPC endpoint is down');
        console.log('2. Firewall blocking connection');
        console.log('3. Port 9000 is not open');
        console.log('4. IP address has changed');
        process.exit(1);
    }

    console.log('✅ Basic connection successful');

    // Then try RPC specific connection
    console.log('\nTesting RPC connection...');
    try {
        const chain = await client.getChainIdentifier();
        console.log('Connected to chain:', chain);
        
        // Run the full health check
        await quickHealthCheck();
    } catch (error) {
        console.error('Failed to connect to RPC:', error);
        process.exit(1);
    }
}

main().catch(console.error); 
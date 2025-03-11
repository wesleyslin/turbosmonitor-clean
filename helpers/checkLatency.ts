import { client } from '../config/client';

export async function quickHealthCheck(): Promise<number> {
    console.log('\n=== RPC Health Check ===');
    console.log('Testing endpoint:', process.env.HTTPS_ENDPOINT);

    const attempts = 3;
    const latencies: number[] = [];
    let successCount = 0;

    for (let i = 1; i <= attempts; i++) {
        try {
            const start = Date.now();
            // Test a basic RPC call with the correct method name
            await client.getCheckpoint({ id: '0' });
            const latency = Date.now() - start;
            
            latencies.push(latency);
            successCount++;
            console.log(`Attempt ${i}: ${latency}ms ✅`);
        } catch (error) {
            console.log(`Attempt ${i}: Failed ❌`);
            console.error('Error:', error);
            latencies.push(Infinity);
        }
    }

    const validLatencies = latencies.filter(l => l !== Infinity);
    const avgLatency = validLatencies.length > 0 
        ? validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length 
        : Infinity;

    console.log('\nLatency Summary:');
    console.log(`Min: ${Math.min(...validLatencies)}ms`);
    console.log(`Max: ${Math.max(...validLatencies)}ms`);
    console.log(`Avg: ${avgLatency.toFixed(2)}ms`);
    console.log(`Success Rate: ${successCount}/${attempts}`);
    console.log('=====================\n');

    return avgLatency;
} 
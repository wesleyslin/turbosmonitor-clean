// proxyAxios.ts
import axios from 'axios';

const proxyAxios = axios.create({
    timeout: 30000,  // 30 seconds timeout
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add response interceptor with retry logic
proxyAxios.interceptors.response.use(undefined, async (err) => {
    const { config } = err;
    
    // Only retry on timeout errors
    if (err.code === 'ECONNABORTED' && err.message.includes('timeout')) {
        console.log('Request timed out, restarting...');
        
        // Wait 5 seconds before restarting
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Return false to indicate restart needed
        return Promise.reject({ restart: true });
    }
    
    return Promise.reject(err);
});

export default proxyAxios;
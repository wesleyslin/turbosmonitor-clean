import { getDatabase } from '../helpers/database';

async function deleteToken(identifier: string, type: 'listing_id' | 'token_address') {
    const db = await getDatabase();
    
    const stmt = db.prepare(`
        DELETE FROM tokens 
        WHERE ${type} = ?
    `);

    const result = stmt.run(identifier);
    console.log(`Deleted ${result.changes} rows`);
}

// Usage example:
const identifier = process.argv[2];  // Get from command line
const type = process.argv[3] as 'listing_id' | 'token_address' || 'listing_id';

if (!identifier) {
    console.log('Please provide an identifier');
    process.exit(1);
}

deleteToken(identifier, type)
    .then(() => process.exit(0))
    .catch(error => {
        console.error('Error:', error);
        process.exit(1);
    }); 
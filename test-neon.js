
require('dotenv').config();
const { Client } = require('pg');

async function testConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const result = await client.query(
      'SELECT current_database() AS database, NOW() AS server_time'
    );

    console.log('Neon connection successful!');
    console.log('Database:', result.rows[0].database);
    console.log('Server time:', result.rows[0].server_time);
  } catch (error) {
    console.error('Connection failed:', error.message);
  } finally {
    await client.end().catch(() => {});
  }
}

testConnection();

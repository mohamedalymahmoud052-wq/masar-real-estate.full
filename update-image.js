
require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  const imageUrl =
    'https://res.cloudinary.com/eprb95s6/image/upload/v1792352365/WhatsApp_Image_2026-10-14_at_12.14.23_PM.jpg';

  const result = await client.query(
    'UPDATE properties SET image_url = $1, images = $2 WHERE id = $3 RETURNING id, title',
    [imageUrl, JSON.stringify([imageUrl]), 4]
  );

  if (result.rowCount === 0) {
    console.log('Property ID 4 was not found.');
  } else {
    console.log('Image updated successfully:', result.rows[0]);
  }

  await client.end();
}

main().catch(async (error) => {
  console.error('Update failed:', error.message);
  await client.end().catch(() => {});
  process.exitCode = 1;
});

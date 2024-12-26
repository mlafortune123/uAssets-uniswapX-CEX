import { pool } from './index';
import * as fs from 'fs';
import * as path from 'path';

export async function runMigrations() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Create migrations table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);

        // Read and execute migration files
        const migrationsDir = path.join(__dirname, '../../migrations');
        const files = fs.readdirSync(migrationsDir).sort();

        for (const file of files) {
            const executed = await client.query(
                'SELECT id FROM migrations WHERE name = $1',
                [file]
            );

            if (executed.rows.length === 0) {
                const sql = fs.readFileSync(
                    path.join(migrationsDir, file),
                    'utf-8'
                );
                await client.query(sql);
                await client.query(
                    'INSERT INTO migrations (name) VALUES ($1)',
                    [file]
                );
                console.log(`Executed migration: ${file}`);
            }
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

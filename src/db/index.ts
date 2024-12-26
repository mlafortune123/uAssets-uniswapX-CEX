import { Pool } from 'pg';
import { dbConfig } from '../credentials';

export const pool = new Pool(dbConfig);
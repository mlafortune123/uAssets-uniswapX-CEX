-- First, update the status enum to include AWAITING_SIGNATURE
CREATE TYPE status AS ENUM (
    'AWAITING_SIGNATURE',  -- Order created but not signed
    'PENDING',            -- Order signed and ready for execution
    'EXECUTED',           -- Order has been executed
    'FAILED'             -- Order execution failed
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_id INTEGER NOT NULL,
    reactor_address TEXT NOT NULL,
    swapper_address TEXT NOT NULL,
    input_token TEXT NOT NULL,
    input_amount NUMERIC NOT NULL,
    output_token TEXT NOT NULL,
    output_amount NUMERIC NOT NULL,
    serialized_order TEXT NOT NULL,
    nonce text NOT NULL,
    deadline NUMERIC NOT NULL,
    order_signature TEXT,           -- Changed from signature to be explicit
    cosigner_signature TEXT,        -- Added for our cosigner signature
    cosigner_data JSONB,           -- Store cosigner parameters
    filler_address TEXT,
    tx_hash TEXT,
    status status NOT NULL DEFAULT 'AWAITING_SIGNATURE',
    gas_used NUMERIC,
    effective_gas_price NUMERIC,
    block_number INTEGER,
    block_timestamp TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
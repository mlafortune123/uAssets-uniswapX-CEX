ALTER TABLE orders 
ADD COLUMN cosigner_address VARCHAR(42) NOT NULL DEFAULT '0x0000000000000000000000000000000000000000';
-- Remove default after adding to existing rows
ALTER TABLE orders 
ALTER COLUMN cosigner_address DROP DEFAULT;
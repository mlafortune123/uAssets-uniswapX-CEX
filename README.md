# Hardhat UniswapX uAssets Exchange
This project demonstrates an advanced Hardhat use case. It comes with a sample contract, a test for that contract, as well as tests for trading uAssets through uniswapX via creating, signing, and fulfilling dutchOrders.
It also comes with a reliable API for forwarding calls from a frontend application to the uniswapX contract, specifically for trading uAssets. The frontend will handle the pricing (Or we could get a database/API to do it. I would call a price API)

By default it forks the Arbitrum chain, as that's the only chain with both uAssets and uniswapX contracts live right now, so it would be first production deployment. A sepolia launch would require launching the uAsset contracts on said chain. (I might do that for fun later.)

# SETUP
npm install
npx hardhat test test/uAssets.test.ts
And you will need a:

# Example .env file
ARBITRUM_MAINNET_RPC_URL=https://arbitrum-mainnet.infura.io/v3/your-api-key
V2_DUTCH_ORDER_REACTOR=0x1bd1aAdc9E230626C44a139d7E70d842749351eb
UDOGE_TOKEN_ADDRESS=0x12E96C2BFEA6E835CF8Dd38a5834fa61Cf723736
UBTC_TOKEN_ADDRESS=0xF1143f3A8D76f1Ca740d29D5671d365F66C44eD1
UBTC_WHALE=0x66C2491Cc47986e3d772B14d5fcD5583Aae1860b
UDOGE_WHALE=0x2bf0d222b81c039262e948d3Cf99f8AaB364e5A9
PERMIT2_ADDRESS=0x000000000022D473030F116dDEE9F6B43aC78BA3
CHAIN_ID=42161
DEBUG_MODE=false
NODE_ENV=development
//the following are only needed to run the server
PORT=3000
DB_USER=
DB_PASSWORD=
DB_HOST=localhost
DB_NAME=postgres
DB_PORT=5432
//the following are only needed for launching or impersonating users
COSIGNER_PRIVATE_KEY=
EXAMPLE_USER_PRIVATE_KEY=
EXAMPLE_USER_ADDRESS=
EXAMPLE_FILLER_PRIVATE_KEY=
EXAMPLE_FILLER_ADDRESS=

# Apologizing for the package nightmare - don't run npm audit
I know the packages suck, I'm sorry. The uniswapX contract uses a old version of ethers, which requires a old version of hardhat, which requires an old version of chai.
TLDR; chai over version 4.3.7 will break everything and idk how to fix it.

# How I'd upgrade it in the future
Implement ZK roll ups, rate limiting, price checking API, and of course:
https://app.universalassets.xyz/api/check-restriction?address=
https://app.universalassets.xyz/api/users/whitelist_check?address=
https://app.universalassets.xyz/api/rewards/available-credits?address=
https://app.universalassets.xyz/api/rewards/coupons?address=

# Frequently encountered BUGS of uniswap and testing with hardhat
This is docusign levels of bad error descriptions man. So if you call any of their smart contract functions but miss any required values, you will most likely get an "cant read properties of undefined, reading .toHexString"
If you're on the wrong chain, all of your attempts at signing will fail no matter what.

Hardhat, TS, and testing libraries don't get along. At all. Because of the way libraries like chai, jest, and mocha name imports, and handle typing of those imports, your files loaded into a test can't share any of the same imports. Or it will break. Also typing doesn't really seem to work. 

Because of this, testing the app itself is impossible to do with hardhat. What you can do is fork a chain using hardhat in one terminal, connect through a provider,then run whatever tests you like directly through the library of your choice, but hardhat can't do both.
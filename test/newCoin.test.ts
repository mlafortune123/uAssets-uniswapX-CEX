import { ethers as hardhatEthers } from 'hardhat';
import { BigNumber, ethers } from "ethers"; //These are for Wallets, Contracts, and other methods 
import { V2DutchOrderBuilder } from '@uniswap/uniswapx-sdk'; //Where we build and trade with uniswapX
import { expect } from "chai";

describe('UniswapX MockERC20 Token Trade', function () {
    // Deployment parameters
    const ARBITRUM_CHAIN_ID = parseInt(process.env.CHAIN_ID)
    const PERMIT2_ADDRESS = process.env.PERMIT2_ADDRESS 
    const V2_DUTCH_ORDER_REACTOR =  process.env.V2_DUTCH_ORDER_REACTOR

    // Test wallets
    let swapper: ethers.Wallet;
    let cosigner: ethers.Wallet;
    let admin: ethers.Signer;

    // Token contracts
    let inputToken: ethers.Contract;
    let outputToken: ethers.Contract;

    // Amounts and nonce
    let inputAmount: BigNumber;
    let outputAmount: BigNumber;
    let nonce: BigNumber;
    let signature;
    let serializedOrder;

    before(async function () {
        // Get admin signer
        [admin] = await hardhatEthers.getSigners();

        // Create test wallets
        swapper = hardhatEthers.Wallet.createRandom().connect(hardhatEthers.provider);
        cosigner = hardhatEthers.Wallet.createRandom().connect(hardhatEthers.provider);
        await admin.sendTransaction({
            to: swapper.address,
            value: ethers.utils.parseEther('10') // Send 10 ETH
        });

        await admin.sendTransaction({
            to: cosigner.address,
            value: ethers.utils.parseEther('10') // Send 10 ETH
        });
        // Deploy mock ERC20 tokens
        const tokenFactory = await hardhatEthers.getContractFactory('MockERC20');

        // Deploy input and output tokens
        inputToken = await tokenFactory.deploy('Input Token', 'INPUT', 18);
        outputToken = await tokenFactory.deploy('Output Token', 'OUTPUT', 18);

        // Fund swapper with input tokens
        inputAmount = ethers.utils.parseUnits('1000', 18);
        await inputToken.mint(swapper.address, inputAmount);

        // Fund output token receiver (filler)
        outputAmount = ethers.utils.parseUnits('500', 18);
        await outputToken.mint(await admin.getAddress(), outputAmount);

        // Set initial nonce
        nonce = BigNumber.from(await hardhatEthers.provider.getTransactionCount(swapper.address));

        // Log deployment details
        console.log('Input Token Address:', inputToken.address);
        console.log('Output Token Address:', outputToken.address);
        console.log('Swapper Address:', swapper.address);
        console.log('Cosigner Address:', cosigner.address);
    });

    it("Should create, sign, and prepare a new order", async function () {
        // Approve tokens for the reactor
        const tokenContract = inputToken.connect(swapper);
        await tokenContract.approve(V2_DUTCH_ORDER_REACTOR, inputAmount);
        await tokenContract.approve(PERMIT2_ADDRESS, inputAmount);
        // Set order deadline
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

        // Prepare cosigner data with comprehensive configuration
        const cosignerData = {
            decayStartTime: deadline - 300,  // Start decay 5 minutes before deadline
            decayEndTime: deadline,          // End decay at deadline
            exclusiveFiller: ethers.constants.AddressZero,  // No exclusive filler
            exclusivityOverrideBps: BigNumber.from(0),      // No exclusivity override
            inputOverride: inputAmount,  // Slight input increase
            outputOverrides: [outputAmount]  // Original output amount
        };

        // Build the order with UniswapX Dutch Order Builder
        const builder = new V2DutchOrderBuilder(
            ARBITRUM_CHAIN_ID,
            V2_DUTCH_ORDER_REACTOR,
            PERMIT2_ADDRESS
        )
            .swapper(swapper.address)
            .deadline(deadline)
            .nonce(nonce)
            .cosigner(cosigner.address)  // Set cosigner address
            .input({
                token: inputToken.address,
                startAmount: inputAmount,
                endAmount: inputAmount
            })
            .output({
                token: outputToken.address,
                startAmount: outputAmount,
                endAmount: outputAmount.mul(9).div(10),  // Slight decay
                recipient: swapper.address
            });

        // Build partial order
        const partialOrder = builder.buildPartial();

        // Generate cosigner signature
        const cosignatureHash = partialOrder.cosignatureHash(cosignerData);
        const cosignature = ethers.utils.joinSignature(
            cosigner._signingKey().signDigest(cosignatureHash)
        );

        // Complete the order
        const order = builder
            .cosignature(cosignature)
            .cosignerData(cosignerData)
            .build();

        // Prepare for signing
        const { domain, types, values } = order.permitData();
        console.log(domain, types, values)
        try {
            signature = await swapper._signTypedData(domain, types, values);
        } catch (error) {
            console.error('Full Error Details:');
            console.error('Name:', error.name);
            console.error('Message:', error.message);
            console.error('Stack:', error.stack);
        }
        // Optional: Serialize the order
        serializedOrder = order.serialize();

        console.log('Serialized Order:', serializedOrder);
        console.log('Order Signature:', signature);
    });
    it("Should fill a created order", async function () {
        // Setup filler wallet
        const filler = hardhatEthers.Wallet.createRandom().connect(hardhatEthers.provider);
        await admin.sendTransaction({
            to: filler.address,
            value: ethers.utils.parseEther('10')
        });
    
        // Fund filler with output tokens
        await outputToken.connect(admin).transfer(filler.address, outputAmount);
        await outputToken.connect(filler).approve(V2_DUTCH_ORDER_REACTOR, outputAmount);
    
        // Create reactor contract
        const reactor = new ethers.Contract(
            V2_DUTCH_ORDER_REACTOR,
            [
                "function execute(tuple(bytes order, bytes sig)) external payable",
                "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)"
            ],
            filler
        );
    
        const orderParam = {
            order: serializedOrder,
            sig: signature
        };
    
        // Execute order
        const tx = await reactor.execute(orderParam);
        const receipt = await tx.wait();
        
        const event = receipt.events?.find(e => e.event === 'Fill');
        console.log('Fill Event:', event);
        
        expect(event?.args?.filler).to.equal(filler.address);
        expect(event?.args?.swapper).to.equal(swapper.address);
        expect(event?.args?.nonce).to.equal(nonce);
    
        // Verify token transfers
        const swapperInputBalance = await inputToken.balanceOf(swapper.address);
        const fillerOutputBalance = await outputToken.balanceOf(filler.address);
        expect(swapperInputBalance).to.equal(0);
        expect(fillerOutputBalance).to.equal(0);
    });
});
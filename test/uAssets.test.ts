import hre, { ethers as hardhatEthers } from 'hardhat';
import { BigNumber, utils, ethers } from "ethers";
import { V2DutchOrderBuilder } from '@uniswap/uniswapx-sdk';
import { expect } from "chai";

describe('UniswapX uDoge to uBTC Impersonating Whales', function () {
    // Constant addresses for contract interactions
    const CHAIN_ID = parseInt(process.env.CHAIN_ID);
    const PERMIT2_ADDRESS = process.env.PERMIT2_ADDRESS;
    const V2_DUTCH_ORDER_REACTOR = process.env.V2_DUTCH_ORDER_REACTOR;
    const UDOGE_TOKEN_ADDRESS = process.env.UDOGE_TOKEN_ADDRESS;
    const UBTC_TOKEN_ADDRESS = process.env.UBTC_TOKEN_ADDRESS;
    const UDOGE_WHALE = process.env.UDOGE_WHALE;
    const UBTC_WHALE = process.env.UBTC_WHALE;
    // Test wallets
    let swapper: ethers.Wallet;
    let cosigner: ethers.Wallet;
    //test contracts
    let uDogeContract: ethers.Contract;
    let uBTCContract: ethers.Contract;
    //test inputs
    let inputAmount: BigNumber;
    let outputAmount: BigNumber;
    let nonce: BigNumber;
    let builder;
    let serializedOrder;
    let signature;
    let cosignerData;

    before(async function () {
        // Create new wallets with fresh private keys
        swapper = hardhatEthers.Wallet.createRandom().connect(hardhatEthers.provider);
        cosigner = hardhatEthers.Wallet.createRandom().connect(hardhatEthers.provider);
        // Fund the swapper wallet with ETH
        await hre.network.provider.send("hardhat_setBalance", [
            swapper.address,
            "0x1000000000000000000" // 1 ETH
        ]);

        // Get token balances (similar to previous implementation)
        const balanceOfSignature = utils.id("balanceOf(address)").slice(0, 10);
        const abiCoder = new ethers.utils.AbiCoder();

        // Get uDoge balance from whale
        const dogeCallData = balanceOfSignature +
            ethers.utils.hexZeroPad(UDOGE_WHALE, 32).slice(2);

        const dogeBalanceResult = await hre.network.provider.send('eth_call', [{
            to: UDOGE_TOKEN_ADDRESS,
            data: dogeCallData
        }, 'latest']);

        // Decode and prepare input amount
        const dogeBalance = abiCoder.decode(['uint256'], dogeBalanceResult)[0];
        inputAmount = BigNumber.from(dogeBalance.toString()).div(10);

        // Similarly for uBTC
        const uBTCCallData = balanceOfSignature +
            ethers.utils.hexZeroPad(UBTC_WHALE, 32).slice(2);

        const uBTCBalanceResult = await hre.network.provider.send('eth_call', [{
            to: UBTC_TOKEN_ADDRESS,
            data: uBTCCallData
        }, 'latest']);

        const BTCBalance = abiCoder.decode(['uint256'], uBTCBalanceResult)[0];
        outputAmount = BigNumber.from(BTCBalance.toString()).div(10);

        // Impersonate whale to transfer tokens
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [UDOGE_WHALE]
        });
        const uDogeWhale = await hardhatEthers.getSigner(UDOGE_WHALE);

        // Create token contract interfaces
        uDogeContract = new ethers.Contract(
            UDOGE_TOKEN_ADDRESS,
            ['function transfer(address to, uint256 amount) public returns (bool)',
                'function approve(address spender, uint256 amount) public returns (bool)',
                "function balanceOf(address) view returns (uint256)",
                "function allowance(address, address) view returns (uint256)"],
            uDogeWhale
        );

        // Transfer tokens to swapper
        await uDogeContract.transfer(swapper.address, inputAmount);

        // Set nonce
        nonce = BigNumber.from(100);
        await uDogeContract.connect(swapper).approve(PERMIT2_ADDRESS, inputAmount);
    });

    it("Should create, sign, and send a new order", async function () {
        await uDogeContract.approve(V2_DUTCH_ORDER_REACTOR, inputAmount);

        // Set order deadline
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

        // Build the order
        builder = new V2DutchOrderBuilder(CHAIN_ID, V2_DUTCH_ORDER_REACTOR, PERMIT2_ADDRESS)
            .swapper(swapper.address)
            .deadline(deadline)
            .nonce(nonce)
            .cosigner(cosigner.address)
            .input({
                token: UDOGE_TOKEN_ADDRESS,
                startAmount: inputAmount,
                endAmount: inputAmount
            })
            .output({
                token: UBTC_TOKEN_ADDRESS,
                startAmount: outputAmount,
                endAmount: outputAmount.mul(9).div(10),
                recipient: swapper.address
            });

        // Prepare cosigner data
        cosignerData = {
            decayStartTime: deadline - 100,
            decayEndTime: deadline,
            exclusiveFiller: ethers.constants.AddressZero,
            exclusivityOverrideBps: BigNumber.from(0),
            inputOverride: inputAmount,
            outputOverrides: [outputAmount]
        };

        // Build partial order
        const partialOrder = builder.buildPartial();

        // Get cosignature
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
        // Sign the order
        signature = await swapper._signTypedData(domain, types, values);
        // Serialize the order
        serializedOrder = order.serialize();
    });
    it("Should fill a created order", async function () {
        // Setup filler wallet
        const filler = hardhatEthers.Wallet.createRandom().connect(hardhatEthers.provider);

        // Fund filler with ETH and uBTC (assuming we have a uBTC whale)
        await hre.network.provider.send("hardhat_setBalance", [
            filler.address,
            "0x1000000000000000000" // 1 ETH
        ]);

        // Impersonate uBTC whale to transfer tokens
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [UBTC_WHALE]
        });

        const btcWhale = await hardhatEthers.getSigner(UBTC_WHALE);

        // Transfer uBTC to filler
        uBTCContract = new ethers.Contract(
            UBTC_TOKEN_ADDRESS,
            ['function transfer(address to, uint256 amount) public returns (bool)',
                'function approve(address spender, uint256 amount) public returns (bool)',
                "function balanceOf(address) view returns (uint256)",
                "function allowance(address, address) view returns (uint256)"],
            btcWhale
        );
        await uBTCContract.transfer(filler.address, outputAmount);
        await uBTCContract.approve(V2_DUTCH_ORDER_REACTOR, outputAmount);

        // Switch to filler for approvals
        uBTCContract = uBTCContract.connect(filler);
        const reactor = new ethers.Contract(V2_DUTCH_ORDER_REACTOR,
            ["function execute(tuple(bytes order, bytes sig)) external payable",
                "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)",
                "event OwnershipTransferred(address indexed user, address indexed newOwner)",
                "event ProtocolFeeControllerSet(address oldFeeController, address newFeeController)"
            ],
            filler);

        // Check uBTC approvals
        await uBTCContract.approve(V2_DUTCH_ORDER_REACTOR, outputAmount);
        await uDogeContract.connect(swapper).approve(PERMIT2_ADDRESS, inputAmount);

        const orderParam = {
            order: serializedOrder,
            sig: signature
        };
        // Execute order

        const tx = await reactor.execute(orderParam);

        const receipt = await tx.wait();

        const event = receipt.events?.find(e => e.event === 'Fill');
        console.log(event)
        expect(event?.args?.filler).to.equal(filler.address);
        expect(event?.args?.swapper).to.equal(swapper.address);
        expect(event?.args?.nonce).to.equal(nonce);
    });
});
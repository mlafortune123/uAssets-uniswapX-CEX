import { V2DutchOrderBuilder } from '@uniswap/uniswapx-sdk';
//import { ethers as hardhatEthers } from 'hardhat';
import { BigNumber, ethers } from "ethers";
import { TradeParameters } from "./types";

export async function createUniswapXOrder(
    swapper: ethers.Wallet,
    cosigner: ethers.Wallet,
    params: TradeParameters,
    inputToken: ethers.Contract,
    outputToken: ethers.Contract,
    hardhatEthers: any
) {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const nonce = BigNumber.from(await hardhatEthers.provider.getTransactionCount(swapper.address));

    const cosignerData = {
        decayStartTime: deadline - 300,
        decayEndTime: deadline,
        exclusiveFiller: ethers.constants.AddressZero,
        exclusivityOverrideBps: BigNumber.from(0),
        inputOverride: params.inputAmount, //This could be taken from the frontend. It represents the lowest amount swapper is willing to sell
        outputOverrides: [params.outputAmount]
    };

    const builder = new V2DutchOrderBuilder(
        params.chainId,
        params.reactorAddress,
        params.permit2Address
    )
        .swapper(swapper.address)
        .deadline(deadline)
        .nonce(nonce)
        .cosigner(cosigner.address)
        .input({
            token: inputToken.address,
            startAmount: params.inputAmount,
            endAmount: params.inputAmount
        })
        .output({
            token: outputToken.address,
            startAmount: params.outputAmount,
            endAmount: params.outputAmount.mul(9).div(10), //This could be taken from the frontend, but it's not needed for this test
            recipient: swapper.address
        });

    const partialOrder = builder.buildPartial();
    const cosignatureHash = partialOrder.cosignatureHash(cosignerData);
    const cosignature = await cosigner.signMessage(cosignatureHash);

    const order = builder
        .cosignature(cosignature)
        .cosignerData(cosignerData)
        .build();

    const { domain, types, values } = order.permitData();
    const typedDomain = {
        name: domain.name,
        version: domain.version || '1',
        chainId: BigInt(params.chainId),
        verifyingContract: domain.verifyingContract
    };

    const signature = await swapper._signTypedData(typedDomain, types, values);

    return {
        order,
        signature,
        serializedOrder: order.serialize()
    };
}
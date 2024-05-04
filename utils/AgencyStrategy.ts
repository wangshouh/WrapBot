import { concat, createWalletClient, encodeAbiParameters, erc20Abi, http, keccak256, maxUint256, parseAbi, toHex } from "viem"
import { agencyABI, appABI } from "../abi/agency"
import { ROUTER, prisma, publicClient, rpcUrl } from "./config"
import { agentABI } from "../abi/agent"
import { getTelegramAddress, getTelegramPrivKey } from "./Account"
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { routerABI } from "../abi/router"

export const getAgencyStrategy = async (agencyAddress: `0x${string}`) => {
    const agencyStrategy = await publicClient.readContract({
        address: agencyAddress,
        abi: agencyABI,
        functionName: "getStrategy",
    })

    return agencyStrategy
}

export const getAgentAddress = async (agencyAddress: `0x${string}`) => {
    const agentAddress = await prisma.agency.findFirst({
        where: {
            agencyAddress: agencyAddress
        }
    })
    
    return agentAddress
}

// console.log(getAgentAddress)

export const getERC20Name = async (tokenAddress: `0x${string}`) => {
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
        return 'ETH'
    } else {
        const name = await publicClient.readContract({
            address: tokenAddress,
            abi: parseAbi(['function name() view returns (string)']),
            functionName: "name",
        })
        return name
    }
}

export const getTokenBalace = async (tokenAddress: `0x${string}`, userAddress: `0x${string}`) => {
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
    }
}

export const isRouterApprove = async (tokenAddress: `0x${string}`, userAddress: `0x${string}`) => {
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
        return true
    } else {
        const approvedValue = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "allowance",
            args: [userAddress, ROUTER]
        })
        // console.log(`Approve Value: ${approvedValue}`)
        if (approvedValue == maxUint256) {
            return true
        } else {
            return false
        }
    }
}

export const getAgentName = async (agentAddress: `0x${string}`) => {
    const agentName = await publicClient.readContract({
        address: agentAddress,
        abi: appABI,
        functionName: "name",
    })

    return agentName
}

export const getAgentMaxSupply = async (agentAddress: `0x${string}`) => {
    const maxSupply = await publicClient.readContract({
        address: agentAddress,
        abi: agentABI,
        functionName: "getMaxSupply",
    })

    return maxSupply
}

const getAgencyTotalSupply = async (appAddress: `0x${string}`) => {
    const totalSupply = await publicClient.readContract({
        address: appAddress,
        abi: appABI,
        functionName: "totalSupply",
    })

    return totalSupply
}

export const getAgentMintPrice = async (agencyAddress: `0x${string}`, appAddress: `0x${string}`) => {
    const totalSupply = await getAgencyTotalSupply(appAddress)

    const nowAgencyPrice = await publicClient.readContract({
        address: agencyAddress,
        abi: agencyABI,
        functionName: "getWrapOracle",
        args: [toHex(totalSupply, { size: 32 })]
    })

    return nowAgencyPrice
}

export const getAgenctBurnPrice = async (agencyAddress: `0x${string}`, appAddress: `0x${string}`) => {
    const totalSupply = await getAgencyTotalSupply(appAddress)

    const nowAgencyBurnPrice = await publicClient.readContract({
        address: agencyAddress,
        abi: agencyABI,
        functionName: "getUnwrapOracle",
        args: [toHex(totalSupply, { size: 32 })]
    })

    return nowAgencyBurnPrice
}

const getAgentSymbol = async (agencyAddress: `0x${string}`) => {
    const symbol = await publicClient.readContract({
        address: agencyAddress,
        abi: agentABI,
        functionName: "symbol",
    })

    return symbol
}

export const existAgentName = async (name: string, appAddress: `0x${string}`) => {
    const agentName = await getAgentSymbol(appAddress)
    const nameHash = keccak256(toHex(agentName))
    const rootNode = keccak256(concat([toHex(0, { size: 32 }), nameHash]))
    const subNode = keccak256(concat([rootNode, keccak256(toHex(name))]))

    const request = await publicClient.readContract({
        address: appAddress,
        abi: agentABI,
        functionName: "isRecordExists",
        args: [subNode]
    })

    return request
}

const getWalletClient = async (telegramId: number) => {
    const accountPriv = await getTelegramPrivKey(telegramId)
    const account = privateKeyToAccount(accountPriv)
    const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(rpcUrl)
    })

    return { account, walletClient }
}

export const getAgencyDataFromDb = async (agencyAddress: `0x${string}`) => {
    const agencyData = await prisma.agency.findFirst({
        where: {
            agencyAddress: agencyAddress
        },
        include: {
            token: true
        }
    })

    return agencyData
}
export const wrapAgency = async (name: string, price: bigint, agencyAddress: `0x${string}`, telegramId: number) => {
    const { account, walletClient } = await getWalletClient(telegramId)

    const args = encodeAbiParameters(
        [{ 'name': 'slippagePrice', 'type': 'uint256' }, { 'name': 'name', 'type': 'bytes' }],
        [price, encodeAbiParameters([{ 'name': 'name', 'type': 'string' }], [name])]
    )

    const { request, result } = await publicClient.simulateContract({
        account,
        value: price,
        address: agencyAddress,
        abi: agencyABI,
        functionName: 'wrap',
        args: [
            walletClient.account.address,
            args
        ]
    })

    // console.log(`Wrap Agent ID: ${chalk.blue(result)}`)
    const mintHash = await walletClient.writeContract(request)

    return { tokenId: result, mintHash }
    // console.log(`Mint Hash: ${chalk.blue(mintHash)}`)

}

export const wrapAgencyByRouter = async (name: string, price: bigint, agencyAddress: `0x${string}`, telegramId: number) => {
    const { account, walletClient } = await getWalletClient(telegramId)

    const { request, result } = await publicClient.simulateContract({
        account,
        address: ROUTER,
        abi: routerABI,
        functionName: "wrap",
        args: [agencyAddress, price, name]
    })

    const mintHash = await walletClient.writeContract(request)

    return { tokenId: result, mintHash }
}

export const unwrapAgency = async (tokenId: bigint, agencyAddress: `0x${string}`, telegramId: number) => {
    const { account, walletClient } = await getWalletClient(telegramId)

    const args = encodeAbiParameters(
        [{ 'name': 'slippagePrice', 'type': 'uint256' }, { 'name': 'name', 'type': 'bytes' }],
        [BigInt(0), "0x"]
    )

    const { request } = await publicClient.simulateContract({
        account,
        address: agencyAddress,
        abi: agencyABI,
        functionName: 'unwrap',
        args: [
            account.address, tokenId, args
        ]
    })

    const burnHash = await walletClient.writeContract(request)

    // console.log(`Unwrap Hash: ${chalk.blue(burnHash)}`)

    return burnHash
}

export const approveRouter = async (tokenAddress: `0x${string}`, telegramId: number) => {
    const { account, walletClient } = await getWalletClient(telegramId)

    const { request } = await publicClient.simulateContract({
        account,
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [ROUTER, maxUint256]
    })

    const approveHash = await walletClient.writeContract(request)

    return approveHash
}

export const isApproveOrOwner = async (appAddress: `0x${string}`, tokenId: bigint, telegramId: number) => {
    let nftOwner: `0x${string}`

    const accountAddress = (await getTelegramAddress(telegramId)).accountAddress

    try {
        nftOwner = await publicClient.readContract({
            address: appAddress,
            abi: appABI,
            functionName: "ownerOf",
            args: [tokenId]
        })
    } catch (error) {
        return false
    }

    const results = await publicClient.multicall({
        contracts: [
            {
                address: appAddress,
                abi: appABI,
                functionName: "getApproved",
                args: [tokenId]
            },
            {
                address: appAddress,
                abi: appABI,
                functionName: "isApprovedForAll",
                args: [nftOwner, accountAddress]
            }
        ]
    })

    return nftOwner == accountAddress || results[1].result || results[0].result == accountAddress
}
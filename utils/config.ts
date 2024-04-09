import { PrismaClient } from '@prisma/client'
import { createPublicClient, http, type PublicClient } from 'viem'
import { sepolia } from 'viem/chains'

// https://1rpc.io/sepolia
// 0xEd78bF31CD8E36c628e048D0e47e9a38913d34eF

interface tokenIdConfig {
    name: string,
    value: number
}

interface agencyConfig {
    value: string,
    description: string
}

export const rpcUrl = process.env.RPC_URL
export const MNEMONIC_CODE = process.env.MNEMONIC_CODE as string
const APIURL = 'https://api.thegraph.com/subgraphs/name/amandafanny/erc7527/graphql'

export const prisma = new PrismaClient({
    log: ['query', 'error'],
});

export const publicClient: PublicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl)
}) as PublicClient;
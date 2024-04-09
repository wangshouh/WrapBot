import { mnemonicToAccount } from 'viem/accounts'
import { MNEMONIC_CODE, publicClient } from './config'
import { prisma } from './config'
import { toHex } from 'viem';

export const getTelegramAddress = async (telegramId: number) => {
    let accountAddress: `0x${string}`;
    const account = await prisma.account.findFirst({
        where: {
            telegramUserId: telegramId
        }
    })

    if (account === null) {
        console.log("Account Is Null")
        accountAddress = await generateAccount(telegramId)
    } else {
        accountAddress = account.address as `0x${string}`
    }

    if (account?.address == "0") {
        const newAccount = mnemonicToAccount(
            MNEMONIC_CODE,
            {
                // accountIndex: telegramId,
                accountIndex: account!.id
            }
        )
    
        await prisma.account.update({
            where: {
                telegramUserId: telegramId,
            },
            data: {
                address: newAccount.address,
            }
        })

        accountAddress = newAccount.address
    }

    const ethBalance = await publicClient.getBalance({
        address: accountAddress
    })

    return { accountAddress, ethBalance }
}

export const getTelegramPrivKey = async (telegramId: number) => {
    const userDb = await prisma.account.upsert({
        create: {
            telegramUserId: telegramId
        },
        where: {
            telegramUserId: telegramId
        },
        update: {}
    })

    const privateAccount = mnemonicToAccount(
        MNEMONIC_CODE,
        {
            accountIndex: userDb.id,
        }
    )

    if (userDb.address == "0") {
        await prisma.account.update({
            where: {
                telegramUserId: telegramId
            },
            data: {
                address: privateAccount.address
            }
        })
    }
    
    const hdKey = privateAccount.getHdKey()

    return toHex(hdKey.privateKey!)
}

export const getAccountAgencys = async (telegramId: number) => {
    console.log(`In Founction: ${telegramId}`)

    const agencys = await prisma.agency.findMany({
        where: {
            account: {
                telegramUserId: telegramId
            }
        }
    })

    console.log(`Next Founction: ${telegramId}`)
    
    return agencys
}

// TG ID update
const generateAccount = async (telegramId: number) => {
    // console.log(telegramId);
    const accountDb = await prisma.account.create({
        data: {
            telegramUserId: telegramId,
        },
    })

    console.log(`Account Db is ${accountDb}`)

    const account = mnemonicToAccount(
        MNEMONIC_CODE,
        {
            // accountIndex: telegramId,
            accountIndex: accountDb.id
        }
    )

    await prisma.account.update({
        where: {
            telegramUserId: telegramId,
        },
        data: {
            address: account.address,
        }
    })

    return account.address
}


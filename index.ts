import { Bot, Context, GrammyError, HttpError, session, type SessionFlavor } from "grammy";
import { formatEther, formatUnits, isAddress, parseEther, parseUnits, zeroAddress } from "viem";
import { approveRouter, existAgentName, getAgenctBurnPrice, getAgencyDataFromDb, getAgencyStrategy, getAgentMaxSupply, getAgentMintPrice, getAgentName, getERC20Name, isApproveOrOwner, isRouterApprove, unwrapAgency, wrapAgency, wrapAgencyByRouter } from "./utils/AgencyStrategy";
import { Menu, MenuRange } from "@grammyjs/menu";
import { getAccountAgencys, getERC20Balance, getTelegramAddress, getTelegramPrivKey } from "./utils/Account";
import { bold, fmt, hydrateReply, code, link } from "@grammyjs/parse-mode";
import type { ParseModeFlavor } from "@grammyjs/parse-mode";
import { conversations, type Conversation, type ConversationFlavor, createConversation } from "@grammyjs/conversations";
import { prisma } from "./utils/config";
import { getAgencyInfo, getAgentInfo } from "./utils/GraphData";

interface SessionData {
    agencyAddress: string;
    wrapPrice: bigint;
}

type MyContext = Context & ConversationFlavor & ParseModeFlavor<Context> & SessionFlavor<SessionData>;
type MyConversation = Conversation<MyContext>;

const bot = new Bot<MyContext>(process.env.BOT_API as string);

bot.use(hydrateReply);
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

const addAgency = async (conversation: MyConversation, ctx: MyContext) => {
    await ctx.reply("Please input agency address");
    const { message } = await conversation.wait();
    const agencyAddress = message!.text!;
    if (!isAddress(agencyAddress)) {
        ctx.reply("Not a valid Ethereum address")
    } else {
        // console.log(agencyAddress)
        try {
            const agencyData = await getAgencyInfo(agencyAddress)
            const telegramAddress = await getTelegramAddress(ctx.from!.id)

            if (agencyData === undefined) {
                await ctx.replyFmt(fmt`Agency Not Exist`)
            } else {
                const accountBalance = await getERC20Balance(telegramAddress.accountAddress, agencyData.agencyInstance.currency.id as `0x${string}`, telegramAddress.ethBalance)
                await ctx.replyFmt(
                    fmt(
                        ["", "\n", "\n", "\n", "\n", "\n", ""],
                        fmt`Agency Name: ${bold(agencyData.appInstance.name)}`,
                        fmt`TVL: ${bold(
                            formatUnits(
                                agencyData.agencyInstance.tvl,
                                agencyData.agencyInstance.currency.decimals
                            )
                        )} ${agencyData.agencyInstance.currency.symbol}`,
                        fmt`Mint Fee Percent: ${(agencyData.agencyInstance.mintFeePercent / 100).toFixed(2) + '%'}`,
                        fmt`Burn Fee Percent: ${(agencyData.agencyInstance.burnFeePercent / 100).toFixed(2) + '%'}`,
                        fmt`Account Balance: ${bold(formatUnits(accountBalance, agencyData.agencyInstance.currency.decimals))} ${agencyData.agencyInstance.currency.symbol}`,
                    )
                )
                
                await prisma.tokenInfo.upsert({
                    where: {
                        tokenAddress: agencyData.agencyInstance.currency.id
                    },
                    create: {
                        tokenAddress: agencyData.agencyInstance.currency.id,
                        symbol: agencyData.agencyInstance.currency.symbol,
                        decimals: agencyData.agencyInstance.currency.decimals
                    },
                    update: {
                        symbol: agencyData.agencyInstance.currency.symbol,
                        decimals: agencyData.agencyInstance.currency.decimals
                    }
                })

                await prisma.agency.create({
                    data: {
                        accountId: ctx.from!.id,
                        agencyAddress: agencyAddress,
                        agentAddress: agencyData.appInstance.id,
                        agencyName: agencyData.appInstance.name,
                        tokenAddress: agencyData.agencyInstance.currency.id,
                    }
                })
            }

        } catch (error) {
            await ctx.reply("Not a valid agency address")
        }
    }

    // await ctx.reply(`Welcome to the chat, ${message!.text}!`);
}

const wrapAgencyConversation = async (conversation: MyConversation, ctx: MyContext) => {
    const agencyAddress = ctx.session.agencyAddress as `0x${string}`;
    const wrapPrice = ctx.session.wrapPrice;
    // const agencyStrategy = await getAgencyStrategy(agencyAddress)
    const agencyStrategy = await getAgencyDataFromDb(agencyAddress as `0x${string}`)!

    await ctx.reply("Please input Maximum cost available for mint");
    const { message: slippageMessage } = await conversation.wait();
    const slippagePrice = parseUnits(slippageMessage!.text!, agencyStrategy!.token!.decimals!);

    if (slippagePrice < wrapPrice) {
        ctx.replyFmt(fmt`Slippage price less than wrap price`)
    } else {
        await ctx.reply("Please enter ERC7527 Name: ");
        const { message: agentName } = await conversation.wait();
    
        // ctx.replyFmt(fmt`Agent Name: ${agentName!.text!} slippage price: ${slippagePrice.toString(10)}`)
    
        const existName = await existAgentName(agentName!.text!, agencyStrategy!.agentAddress as `0x${string}`)
    
        if (existName) {
            await ctx.reply("ERC7527 name already exists")
        } else {
            // ctx.replyFmt(fmt`Agent Name: ${agentName!.text!} slippage price: ${slippagePrice.toString(10)}`)
            const normalName = agentName!.text!.toLowerCase()
    
            if (agencyStrategy?.tokenAddress === zeroAddress) {
                const { tokenId, mintHash } = await wrapAgency(normalName, slippagePrice, agencyAddress, ctx.from!.id!)
                await ctx.replyFmt(fmt`Mint Hash: ${link(mintHash, `https://sepolia.etherscan.io/tx/${mintHash}`)}\nToken ID: ${code(tokenId)}`)
            } else {
                const { tokenId, mintHash } = await wrapAgencyByRouter(normalName, slippagePrice, agencyAddress, ctx.from!.id!)
                await ctx.replyFmt(fmt`Mint Hash: ${link(mintHash, `https://sepolia.etherscan.io/tx/${mintHash}`)}\nToken ID: ${code(tokenId)}`)
            }
        }
    }
}

const unwrapAgencyConversation = async (conversation: MyConversation, ctx: MyContext) => {
    const agencyAddress = ctx.session.agencyAddress as `0x${string}`;
    const agencyStrategy = await getAgencyStrategy(agencyAddress)

    await ctx.reply("Please enter ERC7527 NFT ID: ");

    const { message: agencyTokenId } = await conversation.wait();
    // const agencyTokenId = BigInt(await input({ message: 'Enter  NFT ID: ' }))
    const authorityExist = await isApproveOrOwner(agencyStrategy[0], BigInt(agencyTokenId!.text!), ctx.from!.id!)

    if (!authorityExist) {
        await ctx.reply("Not NFT Approve or Owner")
    } else {
        const unwrapHash = await unwrapAgency(BigInt(agencyTokenId!.text!), agencyAddress, ctx.from!.id!)
        await ctx.replyFmt(fmt`Unwrap Hash: ${link(unwrapHash, `https://sepolia.etherscan.io/tx/${unwrapHash}`)}`)
    }
}

bot.use(createConversation(addAgency));
bot.use(createConversation(wrapAgencyConversation));
bot.use(createConversation(unwrapAgencyConversation));

const menu = new Menu<ParseModeFlavor<Context>>('main')
    .text('Wallet', async (ctx) => {
        const accountInfo = await getTelegramAddress(ctx.from.id);
        await ctx.replyFmt(
            fmt`Your Ethereum Address is ${code(accountInfo.accountAddress)}\nETH Balance is ${bold(formatEther(accountInfo.ethBalance))} ETH`,
            { reply_markup: walletMenu }
        )
    })
    .text('Agency', async (ctx) => {
        await ctx.reply("Add or select Agency", { reply_markup: dynamicMenu })
    })

const walletMenu = new Menu<ParseModeFlavor<Context>>('wallet')
    .text("Show PrivateKey", async (ctx) => {
        const tgPriateKet = await getTelegramPrivKey(ctx.from.id);

        await ctx.replyFmt(
            fmt`Private Key is ${code(tgPriateKet)}`
        )
    });

const deleteMenu = new Menu<ParseModeFlavor<MyContext>>('deleteAgency')
    .text("Delete", async (ctx) => {
        await prisma.agency.delete({
            where: {
                accountId_agencyAddress: {
                    accountId: BigInt(ctx.from!.id),
                    agencyAddress: ctx.session.agencyAddress                  
                }
            }
        })
        await ctx.reply("Delete Success")
    })

const wrapAndUnwrapMenu = new Menu<ParseModeFlavor<MyContext>>('wrapAndUnwrap')
    .text("Wrap", async (ctx) => {
        await ctx.conversation.enter("wrapAgencyConversation")
    })
    .text("Unwrap", async (ctx) => {
        // await ctx.conversation.enter("unwrapAgencyConversation")
        await ctx.replyFmt(
            fmt`Select ERC7527 to unwrap`,
            { reply_markup: unwrapMenu }
        )
    }).row()
    .text("Delete", async (ctx) => {
        await prisma.agency.delete({
            where: {
                accountId_agencyAddress: {
                    accountId: BigInt(ctx.from!.id),
                    agencyAddress: ctx.session.agencyAddress                  
                }
            }
        })
        await ctx.reply("Delete Success")
    })

const dynamicMenu = new Menu<MyContext>("dynamic");
dynamicMenu
    .dynamic(async (ctx, range) => {
        const userId = ctx.from?.id || 0

        const accountAgencys = await getAccountAgencys(userId)

        for (const agency of accountAgencys) {
            console.log(agency.agencyName)
            range
                .text(agency.agencyName, async (ctx) => {
                    ctx.session.agencyAddress = agency.agencyAddress
                    const agencyAddress = agency.agencyAddress as `0x${string}`
                    // const agencyStrategy = await getAgencyStrategy(agencyAddress)
                    const wrapAgencyPrice = await getAgentMintPrice(agencyAddress, agency.agentAddress as `0x${string}`)
                    ctx.session.wrapPrice = wrapAgencyPrice[0] + wrapAgencyPrice[1]
                    const unwrapAgencyPrice = await getAgenctBurnPrice(agencyAddress, agency.agentAddress as `0x${string}`)

                    const { accountAddress, ethBalance } = await getTelegramAddress(userId)
                    const isApproved = await isRouterApprove(agency.tokenAddress as `0x${string}`, accountAddress)

                    const agencyTokenData = (await getAgencyDataFromDb(agency.agencyAddress as `0x${string}`))!.token!
                    const accountBalance = await getERC20Balance(accountAddress, agencyTokenData.tokenAddress as `0x${string}`, ethBalance)

                    const wrapShow = fmt(
                        ["", "\n", "\n", "\n"],
                        fmt`Wrap Price: ${bold(formatUnits(wrapAgencyPrice[0], agencyTokenData.decimals))} ${agencyTokenData.symbol}`,
                        fmt`Wrap Fee: ${bold(formatUnits(wrapAgencyPrice[1], agencyTokenData.decimals))} ${agencyTokenData.symbol}`,
                        fmt`Unwrap: ${bold(formatUnits(unwrapAgencyPrice[0] - unwrapAgencyPrice[1], agencyTokenData.decimals))} ${agencyTokenData.symbol}`,
                        fmt`Account Balance: ${bold(formatUnits(accountBalance, agencyTokenData.decimals))} ${agencyTokenData.symbol}`
                    )

                    if (accountBalance < wrapAgencyPrice[0] + wrapAgencyPrice[1]) {
                        await ctx.replyFmt(
                            wrapShow,
                            { reply_markup: deleteMenu }
                        )

                        return
                    }

                    if (isApproved) {
                        await ctx.replyFmt(
                            wrapShow,
                            { reply_markup: wrapAndUnwrapMenu }
                        )
                    } else {
                        await ctx.replyFmt(
                            wrapShow,
                            {
                                reply_markup: wrapAndUnwrapMenu.row().text("Approve", async (ctx) => {
                                    const approveHash = await approveRouter(agency.tokenAddress as `0x${string}`, ctx.from?.id!)
                                    await ctx.replyFmt(fmt`Approve Hash: ${link(approveHash, `https://sepolia.etherscan.io/tx/${approveHash}`)}`)
                                })
                            }
                        )
                    }

                })
                .row();
        }

    })
    .text("Add Agency", async (ctx) => {
        await ctx.conversation.enter("addAgency");
    });

const unwrapMenu = new Menu<MyContext>("unwrap");
unwrapMenu.dynamic(async (ctx, range) => {
    const userId = ctx.from?.id || 0
    const { accountAddress } = await getTelegramAddress(userId)

    const agencyAddress = ctx.session.agencyAddress as `0x${string}`
    
    const accountAgents = await getAgentInfo(accountAddress, agencyAddress)

    if (accountAgents.length === 0) {
        await ctx.reply("No ERC7527")
        return
    }
    for (const agent of accountAgents) {
        range
            .text(agent.name, async (ctx) => {
                const unwrapHash = await unwrapAgency(BigInt(agent.tokenId), agencyAddress, userId)
                await ctx.replyFmt(fmt`Unwrap Hash: ${link(unwrapHash, `https://sepolia.etherscan.io/tx/${unwrapHash}`)}`)
            })
            .row();
    }
})

bot.use(unwrapMenu)
bot.use(deleteMenu)
bot.use(wrapAndUnwrapMenu)
bot.use(dynamicMenu)
bot.use(walletMenu)
bot.use(menu)

bot.command("start", async (ctx) => {
    // Send the menu.
    await ctx.reply("Check out this menu:", { reply_markup: menu });
});

bot.command("check", async (ctx) => {
    const agencyAddress = ctx.match
    if (!isAddress(agencyAddress)) {
        ctx.reply("Not a valid Ethereum address")
    } else {
        console.log(agencyAddress)
        try {
            const agencySettings = await getAgencyStrategy(agencyAddress)

            const tokenName = await getERC20Name(agencySettings[1].currency)

            const agencyName = await getAgentName(agencySettings[0])
            const agentMaxSupply = await getAgentMaxSupply(agencySettings[0])

            ctx.reply(
                `Agency Name: *\\${agencyName}*\n`
                + `Currency: *${tokenName}*\n`
                + `Currency Address: \`${agencySettings[1].currency}\n\``
                + `Base Premium: ${agencySettings[1].basePremium.toString(10)}\n`
                + `Mint Fee Percent: ${agencySettings[1].mintFeePercent.toString(10)}\n`
                + `Burn Fee Percent: ${agencySettings[1].burnFeePercent.toString(10)}\n`
                + `Max Supply: ${agentMaxSupply.toString(10)}`,
                { parse_mode: "MarkdownV2" },
            )
        } catch (error) {
            ctx.reply("Not a valid agency address")
        }
    }
})

bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof GrammyError) {
        console.error("Error in request:", e.description);
    } else if (e instanceof HttpError) {
        console.error("Could not contact Telegram:", e);
    } else {
        console.error("Unknown error:", e);
    }
});

bot.start().then(
    async () => await prisma.$disconnect()
).catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
});

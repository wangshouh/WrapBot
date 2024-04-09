import { Bot, Context, GrammyError, HttpError, session, type SessionFlavor } from "grammy";
import { formatEther, isAddress, parseEther } from "viem";
import { existAgentName, getAgenctBurnPrice, getAgencyStrategy, getAgentMaxSupply, getAgentMintPrice, getAgentName, getERC20Name, isApproveOrOwner, unwrapAgency, wrapAgency } from "./utils/AgencyStrategy";
import { Menu, MenuRange } from "@grammyjs/menu";
import { getAccountAgencys, getTelegramAddress, getTelegramPrivKey } from "./utils/Account";
import { bold, fmt, hydrateReply, code, link } from "@grammyjs/parse-mode";
import type { ParseModeFlavor } from "@grammyjs/parse-mode";
import { conversations, type Conversation, type ConversationFlavor, createConversation } from "@grammyjs/conversations";
import { prisma } from "./utils/config";
import { getAgencyInfo } from "./utils/GraphData";

interface SessionData {
    agencyAddress: string;
    // slippagePrice: number;
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

            if (agencyData === undefined) {
                await ctx.replyFmt(fmt`Agency Not Exist`)
            } else {
                await ctx.replyFmt(
                    fmt(
                        ["", "\n", "\n", "\n", "\n", ""],
                        fmt`Agency Name: ${bold(agencyData.appInstance.name)}`,
                        fmt`TVL: ${bold(formatEther(agencyData.agencyInstance.tvl))} ETH`,
                        fmt`Mint Fee Percent: ${(agencyData.agencyInstance.mintFeePercent / 100).toFixed(2) + '%'}`,
                        fmt`Burn Fee Percent: ${(agencyData.agencyInstance.burnFeePercent / 100).toFixed(2) + '%'}`
                    )
                )

                await prisma.agency.create({
                    data: {
                        accounId: ctx.from!.id,
                        agencyAddress: agencyAddress,
                        agentAddress: agencyData.appInstance.id,
                        agencyName: agencyData.appInstance.name
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
    const agencyStrategy = await getAgencyStrategy(agencyAddress)

    await ctx.reply("Please input Maximum cost available for mint(in ether)");
    const { message: slippageMessage } = await conversation.wait();
    const slippagePrice = parseEther(slippageMessage!.text!);

    await ctx.reply("Please enter Agent Name: ");
    const { message: agentName } = await conversation.wait();

    // ctx.replyFmt(fmt`Agent Name: ${agentName!.text!} slippage price: ${slippagePrice.toString(10)}`)

    const existName = await existAgentName(agentName!.text!, agencyStrategy[0])

    if (existName) {
        await ctx.reply("Agent name already exists")
    } else {
        // ctx.replyFmt(fmt`Agent Name: ${agentName!.text!} slippage price: ${slippagePrice.toString(10)}`)
        const normalName = agentName!.text!.toLowerCase()
        const { tokenId, mintHash } = await wrapAgency(normalName, slippagePrice, agencyAddress, ctx.from!.id!)

        await ctx.replyFmt(fmt`Mint Hash: ${link(mintHash, `https://sepolia.etherscan.io/tx/${mintHash}`)}\nToken ID: ${code(tokenId)}`)
    }
}

const unwrapAgencyConversation = async (conversation: MyConversation, ctx: MyContext) => {
    const agencyAddress = ctx.session.agencyAddress as `0x${string}`;
    const agencyStrategy = await getAgencyStrategy(agencyAddress)

    await ctx.reply("Please enter Agent NFT ID: ");

    const { message: agencyTokenId } = await conversation.wait();
    // const agencyTokenId = BigInt(await input({ message: 'Enter Agent NFT ID: ' }))
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

const wrapAndUnwrapMenu = new Menu<ParseModeFlavor<MyContext>>('wrapAndUnwrap')
    .text("Wrap", async (ctx) => {
        await ctx.conversation.enter("wrapAgencyConversation")
    }).row()
    .text("Unwrap", async (ctx) => {
        await ctx.conversation.enter("unwrapAgencyConversation")
    })

const dynamicMenu = new Menu<MyContext>("dynamic");
dynamicMenu
    .dynamic(async (ctx, range) => {
        const userId = ctx.from?.id || 0

        const accounAgencys = await getAccountAgencys(userId)

        for (const agency of accounAgencys) {
            console.log(agency.agencyName)
            range
                .text(agency.agencyName, async (ctx) => {
                    ctx.session.agencyAddress = agency.agencyAddress
                    const agencyAddress = agency.agencyAddress as `0x${string}`
                    const agencyStrategy = await getAgencyStrategy(agencyAddress)
                    const wrapAgencyPrice = await getAgentMintPrice(agencyAddress, agencyStrategy[0])
                    const unwrapAgencyPrice = await getAgenctBurnPrice(agencyAddress, agencyStrategy[0])
                    await ctx.replyFmt(
                        fmt(
                            ["", "\n", "\n"],
                            fmt`Wrap Price: ${bold(formatEther(wrapAgencyPrice[0]))} ETH`,
                            fmt`Wrap Fee: ${bold(formatEther(wrapAgencyPrice[1]))} ETH`,
                            fmt`Unwrap: ${bold(formatEther(unwrapAgencyPrice[0] - unwrapAgencyPrice[1]))} ETH`
                        ),
                        { reply_markup: wrapAndUnwrapMenu }
                    )
                })
                .row();
        }

    })
    .text("Add Agency", async (ctx) => {
        await ctx.conversation.enter("addAgency");
    });

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

import { prisma } from "./utils/config"

const accounAgency = await prisma.account.findFirst({
    where: {
        id: Number(0)
    },
    include: {
        agencys: true
    }
})

console.log(accounAgency)

accounAgency?.agencys.map(async (agency) => {
    // await ctx.replyFmt(`${agency.agencyName}`)
    console.log(agency.agencyName)
})


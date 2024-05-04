export const generateAgencyInfoGraphql = (agencyAddress: string) => `{\"query\":\"query QueryDotAgency {\\n  dotAgencies(\\n    where: {agencyInstance_: {id: \\\"${agencyAddress}\\\"}}\\n  ) {\\n    agencyImplementation\\n    appImplementation\\n    agencyInstance {\\n      id\\n      mintFeePercent\\n      swap\\n      tvl\\n      burnFeePercent\\n      fee\\n      currency {\\n      id\\n        decimals\\n        symbol\\n      }\\n    }\\n    appInstance {\\n      id\\n      name\\n      totalSupply\\n    }\\n    mintPrice\\n  }\\n}\",\"operationName\":\"QueryDotAgency\",\"extensions\":{}}`

interface DotAgencyData {
  agencyInstance: {
    id: `0x${string}`,
    swap: bigint,
    tvl: bigint,
    mintFeePercent: number,
    burnFeePercent: number,
    currency: {
      id: `0x${string}`,
      decimals: number,
      symbol: string
    }
  },
  appInstance: {
    id: `0x${string}`,
    name: string,
    totalSupply: number
  }
  mintPrice: bigint
}

interface DotAgenciesData {
  data: {
    dotAgencies: DotAgencyData[]
  }
}

export const getAgencyInfo = async (agencyAddress: string) => {
  const response = await fetch("https://api.thegraph.com/subgraphs/name/amandafanny/erc7527",
    {
      body: generateAgencyInfoGraphql(agencyAddress.toLowerCase()),
      method: "POST",
      "headers": {
        "content-type": "application/json"
      }
    }
  )

  const result = await response.json() as DotAgenciesData

  console.log(result.data.dotAgencies)

  return result.data.dotAgencies[0]
}

// console.log(await getAgencyInfo("0xe47cdb0c949cdb5d129f44c76632dd263f00dc57"))
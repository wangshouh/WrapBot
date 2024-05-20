export const generateAgencyInfoGraphql = (agencyAddress: string) => `{\"query\":\"query QueryDotAgency {\\n  dotAgencies(\\n    where: {agencyInstance_: {id: \\\"${agencyAddress}\\\"}}\\n  ) {\\n    agencyImplementation\\n    appImplementation\\n    agencyInstance {\\n      id\\n      mintFeePercent\\n      swap\\n      tvl\\n      burnFeePercent\\n      fee\\n      currency {\\n      id\\n        decimals\\n        symbol\\n      }\\n    }\\n    appInstance {\\n      id\\n      name\\n      totalSupply\\n    }\\n    mintPrice\\n  }\\n}\",\"operationName\":\"QueryDotAgency\",\"extensions\":{}}`
export const generateAgentInfoGraphql = (hodlerAddress: string, agencyAddress: string) => `{\"query\":\"query HolderAgnts {\\n  agents(\\n    where: {agencyInstance_: {id: \\\"${agencyAddress}\\\"}, holder_: {address: \\\"${hodlerAddress}\\\"}}\\n  ) {\\n    id\\n    name\\n    tokenId\\n  }\\n}\",\"operationName\":\"HolderAgnts\",\"extensions\":{}}`

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

interface AgentData {
  id: `0x${string}`,
  name: string,
  tokenId: number
}

interface DotAgenciesData {
  data: {
    dotAgencies: DotAgencyData[]
  }
}

export const getAgencyInfo = async (agencyAddress: string) => {
  const response = await fetch("https://api.studio.thegraph.com/proxy/51301/erc7527/v0.0.1.a4",
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

export const getAgentInfo = async (hodlerAddress: string, agencyAddress: string) => {
  // console.log(hodlerAddress.toLowerCase(), agencyAddress.toLowerCase())
  const response = await fetch("https://api.thegraph.com/subgraphs/name/amandafanny/erc7527",
    {
      body: generateAgentInfoGraphql(hodlerAddress.toLowerCase(), agencyAddress.toLowerCase()),
      method: "POST",
      "headers": {
        "content-type": "application/json"
      }
    }
  )
  // console.log(await response.json())
  const result = await response.json() as { data: { agents: AgentData[] } }
  // console.log(generateAgentInfoGraphql(hodlerAddress.toLowerCase(), agencyAddress.toLowerCase()))
  return result.data.agents
}

// console.log(await getAgentInfo("0x93f0665ccfed6c51051a7ed04b26a95154f7801c", "0x2ef0357a458c142b3dbaa2924069e6a709d552e3"))
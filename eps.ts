import * as data from "./json/eps-distribution-2021-10-28.json"

import { ethers } from "ethers"
import fs from "fs"

// 3% of 1B tokens is allocated to be evenly split between veCRV holders
const TOTAL_REWARD_TOKENS = 30_000_000

interface EPSAirdrop {
  [address: string]: {
    index: number
    amount: string
    proof: string[]
  }
}

// EPS airdrop from: https://github.com/ellipsis-finance/vecrv-airdrop/blob/master/distributions/distribution-2021-10-28.json
const airdrops: EPSAirdrop = data["claims"]

function prettyStringify(json: any) {
  return JSON.stringify(json, null, "    ")
}

async function processEPSAirdrop() {
  const output: { [address: string]: string } = {}
  const addresses = Object.keys(airdrops)
  console.log(`Found ${addresses.length} addresses in the merkle root...`)

  const rewardPerAddress = ethers.utils.parseUnits(
    String(TOTAL_REWARD_TOKENS / addresses.length),
    18,
  )
  console.log(
    `Reward per address: ${ethers.utils.formatUnits(rewardPerAddress, 18)}`,
  )

  for (const address of addresses) {
    output[address] = rewardPerAddress.toString()
  }

  // Write the rewards object as JSON
  await fs.promises.writeFile(
    "./json/vecrv_rewards.json",
    prettyStringify(output),
    "utf8",
  )
}

processEPSAirdrop()

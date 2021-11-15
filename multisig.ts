import { BigNumber, ethers } from "ethers"

import fs from "fs"

// 0.5% of 1B tokens is allocated to be split evenly among the community multisig
const TOTAL_REWARD_TOKENS = 5_000_000
const TOTAL_REWARD_TOKENS_BIGNUMBER = ethers.utils.parseUnits(
  TOTAL_REWARD_TOKENS.toString(),
  18,
)

function prettyStringify(json: any) {
  return JSON.stringify(json, null, "    ")
}

async function processMultisig() {
  const output: { [address: string]: string } = {}

  const reward = TOTAL_REWARD_TOKENS_BIGNUMBER.div(7)

  const rows: { [address: string]: BigNumber } = {
    "0x0AF91FA049A7e1894F480bFE5bBa20142C6c29a9": reward,
    "0x0Cec743b8CE4Ef8802cAc0e5df18a180ed8402A7": reward,
    "0x4E60bE84870FE6AE350B563A121042396Abe1eaF": reward,
    "0x5b97680e165B4DbF5C45f4ff4241e85F418c66C2": reward,
    "0x6F2A8Ee9452ba7d336b3fba03caC27f7818AeAD6": reward,
    "0xa83838221278f22ee5bAe3E523f34D42b066D67D": reward,
    "0xf872703F1C8f93fA186869Bac83BAC5A0c87C3c8": reward,
  }

  let totalRewards = BigNumber.from(0)
  for (const [address, reward] of Object.entries(rows)) {
    totalRewards = totalRewards.add(reward)
    output[address] = reward.toString()
  }

  // Sanity check the results
  console.assert(
    totalRewards.eq(TOTAL_REWARD_TOKENS_BIGNUMBER),
    `rewards did not match (got, expected): ${totalRewards.toString()}, ${TOTAL_REWARD_TOKENS_BIGNUMBER.toString()}`,
  )

  // Write the rewards object as JSON
  await fs.promises.writeFile(
    "./json/multisig.json",
    prettyStringify(output),
    "utf8",
  )
}

processMultisig()

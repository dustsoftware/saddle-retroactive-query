import * as depositorRewardsRaw from "./json/early_depositors.json"
import * as lpRewardsRaw from "./json/retroactive_lp_rewards.json"
import * as vecrvRewardsRaw from "./json/vecrv_rewards.json"
import * as swapperRewardsRaw from "./json/retroactive_swap_rewards.json"
import * as multisigRewardsRaw from "./json/multisig.json"

import { BigNumber, ethers } from "ethers"

import fs from "fs"

// 3% (veCRV) + 0.5% (depositors) + 10.5% (historical LPs) + 0.5% (historical swappers) + 0.5% (multisig) = 15% of 1B tokens is allocated in aggregate to rewards
const TOTAL_EXPECTED_REWARD_TOKENS = 150_000_000
const TOTAL_EXPECTED_REWARD_TOKENS_BIGNUMBER = ethers.utils.parseUnits(
  TOTAL_EXPECTED_REWARD_TOKENS.toString(),
  18,
)

function prettyStringify(json: any) {
  return JSON.stringify(json, null, "    ")
}

interface RewardsJSON {
  [address: string]: string
}

function addNewRewards(mergedRewards: { [address: string]: BigNumber }, newRewards: RewardsJSON) {
  for (const [address, reward] of Object.entries(newRewards)) {
    if (!mergedRewards.hasOwnProperty(address)) mergedRewards[address] = BigNumber.from(0)
    mergedRewards[address] = mergedRewards[address].add(BigNumber.from(reward))
  }
}

async function mergeRewards() {
  const output: RewardsJSON = {}
  const mergedRewards: { [address: string]: BigNumber } = {}

  const lpRewards: RewardsJSON = lpRewardsRaw["default"]
  const vecrvRewards: RewardsJSON = vecrvRewardsRaw["default"]
  const depositorRewards: RewardsJSON = depositorRewardsRaw["default"]
  const swapperRewards: RewardsJSON = swapperRewardsRaw["default"]
  const multisigRewards: RewardsJSON = multisigRewardsRaw["default"]

  // Process all rewards
  addNewRewards(mergedRewards, lpRewards)
  addNewRewards(mergedRewards, vecrvRewards)
  addNewRewards(mergedRewards, depositorRewards)
  addNewRewards(mergedRewards, swapperRewards)
  addNewRewards(mergedRewards, multisigRewards)

  // Sort by total dollar value swapped amounts
  const sortedMergedRewards: { [address: string]: BigNumber } = Object.entries(mergedRewards)
    .sort(([, a], [, b]) => b.lt(a) ? -1 : 1)
    .reduce((r, [k, v]) => ({ ...r, [k]: v }), {})

  // Convert to output format
  let totalRewards: BigNumber = BigNumber.from(0)
  for (const [address, reward] of Object.entries(sortedMergedRewards)) {
    totalRewards = totalRewards.add(reward)
    output[address] = reward.toString()
  }

  // Sanity check the results
  console.assert(
    totalRewards.eq(TOTAL_EXPECTED_REWARD_TOKENS_BIGNUMBER),
    `rewards did not match (got, expected): ${totalRewards.toString()}, ${TOTAL_EXPECTED_REWARD_TOKENS_BIGNUMBER.toString()}`,
  )

  // Write the rewards object as JSON
  await fs.promises.writeFile(
    "./json/rewards.json",
    prettyStringify(output),
    "utf8",
  )
}

mergeRewards()

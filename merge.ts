import * as depositorRewardsRaw from "./json/early_depositors.json"
import * as lpRewardsRaw from "./json/retroactive_lp_rewards.json"
import * as vecrvRewardsRaw from "./json/vecrv_rewards.json"

import { BigNumber, ethers } from "ethers"

import fs from "fs"

// 3% (veCRV) + 0.5% (depositors) + 10% (historical LPs) = 13.5% of 1B tokens is allocated in aggregate to rewards
// TODO: include multisig signers and users
const TOTAL_EXPECTED_REWARD_TOKENS = 135_000_000
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

async function mergeRewards() {
  const output: RewardsJSON = {}
  const mergedRewards: { [address: string]: BigNumber } = {}

  const lpRewards: RewardsJSON = lpRewardsRaw["default"]
  const vecrvRewards: RewardsJSON = vecrvRewardsRaw["default"]
  const depositorRewards: RewardsJSON = depositorRewardsRaw["default"]

  // Process LP rewards
  for (const [address, reward] of Object.entries(lpRewards)) {
    if (!mergedRewards[address]) mergedRewards[address] = BigNumber.from(0)
    mergedRewards[address] = mergedRewards[address].add(BigNumber.from(reward))
  }

  // Process veCRV rewards
  for (const [address, reward] of Object.entries(vecrvRewards)) {
    if (!mergedRewards[address]) mergedRewards[address] = BigNumber.from(0)
    mergedRewards[address] = mergedRewards[address].add(BigNumber.from(reward))
  }

  // Process depositor rewards
  for (const [address, reward] of Object.entries(depositorRewards)) {
    if (!mergedRewards[address]) mergedRewards[address] = BigNumber.from(0)
    mergedRewards[address] = mergedRewards[address].add(BigNumber.from(reward))
  }

  // Convert to output format
  let totalRewards: BigNumber = BigNumber.from(0)
  for (const [address, reward] of Object.entries(mergedRewards)) {
    totalRewards = totalRewards.add(reward)
    output[address] = reward.toString()
  }

  // TODO: add multisig signers

  // TODO: add users if not removed

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

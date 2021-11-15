import * as lpRewardsRaw from "./json/retroactive_lp_rewards.json"
import * as swapperAddressesRaw from "./json/retroactive_swap_addresses.json"
import * as lpTransactionsRaw from "./json/retroactive_lp.json"

import { ethers } from "ethers"
import fs from "fs"

interface LPTransferLog {
  block_number: number
  block_timestamp: string
  address_from: string
  address_to: string
  amount: string
  token: string
}

/*
Mezcal - Who is Eligible: Users who interacted with any of Saddle’s smart contracts at least once (i.e. swapped or provided liquidity)
Amphitrite - Who is Eligible: Top 10% of LPs (through Nov 1st, 2021)
Alpha - Participants of Saddle’s “Proof of Governance” guarded launch
 */
const GUARDED_LAUNCH_END_BLOCK = 11909762 // https://etherscan.io/tx/0xedc38ea0b5f1cc740c6659cdecdc5b379bcd77b1eae59709d41e9811b92a4d66

const lpAddresses = Object.keys(lpRewardsRaw["default"])
const swapperAddresses = Object.keys(swapperAddressesRaw["default"])
const lpTransactions: LPTransferLog[] = lpTransactionsRaw["default"]

function prettyStringify(json: any) {
  return JSON.stringify(json, null, "    ")
}

function createMezcalList(): string[] {
  return [...lpAddresses, ...swapperAddresses]
}

function createAmphitriteList(): string[] {
  const cutoffLength = Math.round(lpAddresses.length / 10)
  return lpAddresses.slice(0, cutoffLength - 1)
}

function createAlphaList(): string[] {
  const alphaSet = new Set<string>()

  for (const lpTransanction of lpTransactions) {
    if (
      Number(lpTransanction.block_number) < GUARDED_LAUNCH_END_BLOCK &&
      lpTransanction.address_from === ethers.constants.AddressZero
    ) {
      alphaSet.add(lpTransanction.address_to)
    }
  }

  return [...alphaSet]
}

async function processGalaxyList() {
  const mezcal: string[] = createMezcalList()
  const amphitrite: string[] = createAmphitriteList()
  const alpha: string[] = createAlphaList()

  // Write the string array as JSON
  await fs.promises.writeFile(
    "./json/galaxy/mezcal.json",
    prettyStringify(mezcal),
    "utf8",
  )

  await fs.promises.writeFile(
    "./json/galaxy/amphitrite.json",
    prettyStringify(amphitrite),
    "utf8",
  )

  await fs.promises.writeFile(
    "./json/galaxy/alpha.json",
    prettyStringify(alpha),
    "utf8",
  )
}

processGalaxyList()

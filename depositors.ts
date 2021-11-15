import { BigNumber, ethers } from "ethers"

import fs from "fs"
import readline from "readline"

// Data is from the following Dune query: https://dune.xyz/queries/18336

// 0.5% of 1B tokens is allocated to be split pro-rata between impacted early depositors
const TOTAL_REWARD_TOKENS = 5_000_000
const TOTAL_REWARD_TOKENS_BIGNUMBER = ethers.utils.parseUnits(
  TOTAL_REWARD_TOKENS.toString(),
  18,
)

function prettyStringify(json: any) {
  return JSON.stringify(json, null, "    ")
}

async function processEarlyDepositors() {
  const output: { [address: string]: string } = {}

  const rl = readline.createInterface({
    input: fs.createReadStream("./early_depositors.csv"),
  })

  // address,contribution,received,slippage,slippage_percent,renbtc,wbtc
  let totalSlippage = BigNumber.from(0)
  const rows: { [address: string]: BigNumber } = {}
  for await (const line of rl) {
    const [rawAddress, , , rawSlippage, , ,] = line.split(",")
    const address = rawAddress.replace("\\", "0")
    const slippage = ethers.utils.parseUnits(rawSlippage, 18)
    if (rows[address]) {
      rows[address] = rows[address].add(slippage)
    } else {
      rows[address] = slippage
    }
    totalSlippage = totalSlippage.add(slippage)
  }

  console.log(
    `Total slippage: ${ethers.utils.formatUnits(totalSlippage, 18)} BTC`,
  )

  let totalRewards = BigNumber.from(0)
  for (const [address, slippage] of Object.entries(rows)) {
    const reward =
      TOTAL_REWARD_TOKENS_BIGNUMBER.mul(slippage).div(totalSlippage)
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
    "./json/early_depositors.json",
    prettyStringify(output),
    "utf8",
  )
}

processEarlyDepositors()

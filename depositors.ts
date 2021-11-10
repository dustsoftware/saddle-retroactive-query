import { BigNumber, ethers } from "ethers"

import fs from "fs"
import readline from "readline"

// Data is from the following Dune query: https://dune.xyz/queries/18336

// 0.5% of 1B tokens is allocated to be split pro-rata between impacted early depositors
const TOTAL_REWARD_TOKENS = 5_000_000

function prettyStringify(json: any) {
  return JSON.stringify(json, null, "    ")
}

async function processEarlyDepositors() {
  const output: { [address: string]: string } = {}

  const rl = readline.createInterface({
    input: fs.createReadStream("./early_depositors.csv"),
  })

  // address,contribution,received,slippage,slippage_percent,renbtc,wbtc
  let totalSlippage = 0
  const rows: { [address: string]: number } = {}
  for await (const line of rl) {
    const [rawAddress, , , rawSlippage, , ,] = line.split(",")
    const address = rawAddress.replace("\\", "0")
    const slippage = Number(rawSlippage)
    if (rows[address]) {
      rows[address] += slippage
    } else {
      rows[address] = slippage
    }
    totalSlippage += slippage
  }

  console.log(`Total slippage: ${totalSlippage}`)

  let totalRewards = BigNumber.from(0)
  for (const [address, slippage] of Object.entries(rows)) {
    const reward = ethers.utils.parseUnits(
      String((slippage / totalSlippage) * TOTAL_REWARD_TOKENS),
      18,
    )
    totalRewards = totalRewards.add(reward)
    output[address] = reward.toString()
  }

  // Sanity check the results
  console.assert(
    ethers.utils.formatUnits(totalRewards, 18) === String(TOTAL_REWARD_TOKENS),
    `rewards did not match (got, expected): ${ethers.utils.formatUnits(
      totalRewards,
      18,
    )}, ${TOTAL_REWARD_TOKENS}`,
  )

  // Write the rewards object as JSON
  await fs.promises.writeFile(
    "./json/early_depositors.json",
    prettyStringify(output),
    "utf8",
  )
}

processEarlyDepositors()

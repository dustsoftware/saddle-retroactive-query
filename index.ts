import * as data from "./json/retroactive_lp.json"

import { BigNumber, ethers } from "ethers"

import fs from "fs"
import readline from "readline"

// Minute granularity BTC and ETH price data is downloaded from: https://duneanalytics.com/queries/95400

// The first swap was deployed on block 11685572, but we instead use the first block that liquidity was added
const START_BLOCK = 11686727
const START_BLOCK_TS = 1611072272
const GUARDED_LAUNCH_END_BLOCK = 11909762 // https://etherscan.io/tx/0xedc38ea0b5f1cc740c6659cdecdc5b379bcd77b1eae59709d41e9811b92a4d66
const END_BLOCK = 12923115
const AVERAGE_BLOCK_TIME = 13 // used to estimate the timestamps for blocks we do not have logs for
const TOTAL_LP_TOKENS = 120_000_000
// Double count the guarded launch since LP'ing during counts for 2X the duration
const TOTAL_BLOCKS =
  END_BLOCK - START_BLOCK + (GUARDED_LAUNCH_END_BLOCK - START_BLOCK)
const TOKENS_PER_BLOCK = ethers.utils.parseUnits(
  String(TOTAL_LP_TOKENS / TOTAL_BLOCKS),
  18,
)

const lpTransferLogs: LPTransferLog[] = data["default"]

interface LPTransferLog {
  block_number: number
  block_timestamp: string
  transaction_hash: string
  address_from: string
  address_to: string
  amount: string
  pool: string
}

interface Holders {
  [holder: string]: {
    lastLPAmountSaved: BigNumber
    lastActionTimestamp: number
    firstObservedTimestamp: number
  }
}

interface AllHolders {
  [pool: string]: Holders
}

interface TotalPoolLPTokens {
  [pool: string]: BigNumber
}

interface MinutePriceData {
  BTC: string
  ETH: string
}

interface PriceData {
  [timestamp: number]: MinutePriceData
}

function processMinting(
  holders: Holders,
  tokens: TotalPoolLPTokens,
  log: LPTransferLog,
) {
  const { block_timestamp, pool, amount, address_to } = log
  const currentTimestamp = Math.round(
    new Date(block_timestamp).getTime() / 1000,
  )

  tokens[pool] = tokens[pool].add(amount)
  if (address_to in holders) {
    const { lastLPAmountSaved, firstObservedTimestamp } = holders[address_to]

    holders[address_to] = {
      lastLPAmountSaved: lastLPAmountSaved.add(amount),
      lastActionTimestamp: currentTimestamp,
      firstObservedTimestamp: firstObservedTimestamp,
    }
  } else {
    // No record for log.address_to found.
    // This is the first time this address received this LP token.
    holders[address_to] = {
      lastLPAmountSaved: BigNumber.from(amount),
      lastActionTimestamp: currentTimestamp,
      firstObservedTimestamp: currentTimestamp,
    }
  }
}

function processBurning(
  holders: Holders,
  tokens: TotalPoolLPTokens,
  log: LPTransferLog,
) {
  const { block_timestamp, pool, amount, address_from } = log
  const { lastLPAmountSaved, firstObservedTimestamp } = holders[address_from]
  const currentTimestamp = Math.round(
    new Date(block_timestamp).getTime() / 1000,
  )

  if (lastLPAmountSaved.sub(amount).lt(0)) {
    throw `user burned (${amount}) more than they had (${lastLPAmountSaved})`
  }

  tokens[pool] = tokens[pool].sub(amount)
  holders[address_from] = {
    lastLPAmountSaved: lastLPAmountSaved.sub(amount),
    lastActionTimestamp: currentTimestamp,
    firstObservedTimestamp: firstObservedTimestamp,
  }
}

function prettyStringify(json: any) {
  return JSON.stringify(json, null, "    ")
}

async function loadPriceData(): Promise<PriceData> {
  const data: PriceData = {}
  const rl = readline.createInterface({
    input: fs.createReadStream("./prices.csv"),
  })

  for await (const line of rl) {
    const [tsRaw, price, asset] = line.split(",")
    const ts = Number(tsRaw)

    if (!data[ts]) {
      data[ts] = {
        BTC: "",
        ETH: "",
      }
    }

    if (asset === "BTC") {
      data[ts].BTC = price
    } else if (asset === "ETH") {
      data[ts].ETH = price
    }
  }

  return data
}

function getTokenPrice(pool: string, priceData: MinutePriceData): BigNumber {
  let tokenPrice = BigNumber.from(1)
  if (["BTC"].includes(pool)) {
    tokenPrice = ethers.utils.parseUnits(priceData.BTC, 2)
  } else if (["vETH2", "alETH"].includes(pool)) {
    tokenPrice = ethers.utils.parseUnits(priceData.ETH, 2)
  }
  return tokenPrice
}

async function processAllLogs() {
  const allHolders: AllHolders = {
    BTC: {},
    USD: {},
    vETH2: {},
    alETH: {},
    d4: {},
  }
  const lpTokens: TotalPoolLPTokens = {
    BTC: BigNumber.from(0),
    USD: BigNumber.from(0),
    vETH2: BigNumber.from(0),
    alETH: BigNumber.from(0),
    d4: BigNumber.from(0),
  }
  const rewards: { [address: string]: BigNumber } = {}

  // Load price data
  const priceData = await loadPriceData()

  // Pre-process logs to group them by block
  const logsByBlock: Map<number, LPTransferLog[]> = new Map<
    number,
    LPTransferLog[]
  >()
  for (const log of lpTransferLogs) {
    const { block_number: raw } = log
    // TODO: why does this not work without explicitly casting?
    const block_number = Number(raw)

    let logs: LPTransferLog[] = []
    if (logsByBlock.has(block_number)) {
      logs = logsByBlock.get(block_number)
    }
    logs.push(log)
    logsByBlock.set(block_number, logs)
  }

  let ts: number
  for (let block = START_BLOCK; block < END_BLOCK; block++) {
    if (block % 10000 === 0) {
      console.log(`Processing block ${block}...`)
    }

    // Update state for the current block if there are transactions
    if (logsByBlock.has(block)) {
      // console.log(`Found logs: ${JSON.stringify(logsByBlock.get(block))}`)

      const blocks = logsByBlock.get(block)
      // Parse and truncate the timestamp to minute level precision for retrieving pricing data
      const parsed = Date.parse(blocks[0].block_timestamp) / 1000
      ts = parsed - (parsed % 60)

      // Filter blocks by transaction type for processing
      const minting = blocks.filter(
        (log) =>
          log.address_from === "0x0000000000000000000000000000000000000000",
      )
      const burning = blocks.filter(
        (log) =>
          log.address_to === "0x0000000000000000000000000000000000000000",
      )
      const transfers = blocks.filter(
        (log) =>
          log.address_from !== "0x0000000000000000000000000000000000000000" &&
          log.address_to !== "0x0000000000000000000000000000000000000000",
      )

      // Process minting before burning
      for (const log of [...minting, ...transfers]) {
        const holders = allHolders[log.pool]
        processMinting(holders, lpTokens, log)
        allHolders[log.pool] = holders
      }

      for (const log of [...burning, ...transfers]) {
        const holders = allHolders[log.pool]
        processBurning(holders, lpTokens, log)
        allHolders[log.pool] = holders
      }
    } else {
      // If there were no logs for a particular block we don't have the unix timestamp, so estimate it
      const estimate =
        START_BLOCK_TS + (block - START_BLOCK) * AVERAGE_BLOCK_TIME
      ts = estimate - (estimate % 60)
    }

    // Calculate total pool USD TVL
    let totalUSDTVL = BigNumber.from(0)
    for (const pool in allHolders) {
      const tokenPrice = getTokenPrice(pool, priceData[ts])
      totalUSDTVL = totalUSDTVL.add(lpTokens[pool].mul(tokenPrice))
    }

    // Distribute tokens
    const reward =
      block < GUARDED_LAUNCH_END_BLOCK
        ? TOKENS_PER_BLOCK.mul(2)
        : TOKENS_PER_BLOCK
    for (const pool in allHolders) {
      const holders = allHolders[pool]
      await Promise.all(
        Object.keys(holders).map(async (address) => {
          const userLPAmount = holders[address].lastLPAmountSaved
          if (!rewards[address]) rewards[address] = BigNumber.from(0)

          const tokenPrice = getTokenPrice(pool, priceData[ts])
          rewards[address] = rewards[address].add(
            userLPAmount.mul(tokenPrice).mul(reward).div(totalUSDTVL),
          )
        }),
      )
    }
  }

  // Sanity check the distribution and convert BigNumber to string for output
  const output: { [address: string]: string } = {}
  let totalRewardsDistributed = BigNumber.from(0)
  for (const [address, reward] of Object.entries(rewards)) {
    totalRewardsDistributed = totalRewardsDistributed.add(reward)
    output[address] = reward.toString()
  }

  console.assert(
    ethers.utils.formatUnits(totalRewardsDistributed, 18) ===
      String(TOTAL_LP_TOKENS),
    `rewards did not match (got, expected): ${ethers.utils.formatUnits(
      totalRewardsDistributed,
      18,
    )}, ${TOTAL_LP_TOKENS}`,
  )

  // Write the rewards object as JSON
  await fs.promises.writeFile(
    "./json/retroactive_lp_rewards.json",
    prettyStringify(output),
    "utf8",
  )
}

processAllLogs()

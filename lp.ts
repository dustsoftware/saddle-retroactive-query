import * as data from './json/retroactive_lp.json'

import {BigNumber, ethers} from 'ethers';

import fs from 'fs'
import readline from 'readline'

// Minute granularity BTC and ETH price data is downloaded from: https://duneanalytics.com/queries/95400

// The first swap was deployed on block 11685572, but we instead use the first block that liquidity was added
const START_BLOCK = 11686727
const START_BLOCK_TS = 1611072272
const END_BLOCK = 12923115
const AVERAGE_BLOCK_TIME = 13 // used to estimate the timestamps for blocks we do not have logs for
const TOTAL_LP_TOKENS = 120_000_000
const TOTAL_BLOCKS = END_BLOCK - START_BLOCK
const TOKENS_PER_BLOCK = ethers.utils.parseUnits(String(TOTAL_LP_TOKENS / TOTAL_BLOCKS), 18)

let lpTransferLogs: LpTransferLog[] = data["default"]

interface LpTransferLog {
  block_number: number,
  block_timestamp: string,
  transaction_hash: string,
  address_from: string,
  address_to: string,
  amount: string,
  pool: string
}

interface Holders {
  [holder: string]: {
    lastLPAmountSaved: BigNumber;
    lastActionTimestamp: number;
    firstObservedTimestamp: number;
    timeWightedLPAmount: BigNumber;
  };
}

interface AllHolders {
  [pool: string]: Holders
}

interface TimeWeightedAmountOutput {
  [pool: string] : {
    [address: string] : string
  }
}

interface TimeWeightedAmountOutputByAddress {
  [address: string] : {
    [pool: string] : string
  }
}

interface MinutePriceData {
  BTC: string,
  ETH: string
}

interface PriceData {
  [timestamp: number] : MinutePriceData
}

function processMinting(holders: Holders, log: LpTransferLog) {
  let currentTimestamp = Math.round(new Date(log.block_timestamp).getTime() / 1000)

  if (holders.hasOwnProperty(log.address_to)) {
    let holder = holders[log.address_to]
    let lastLPAmountSaved = holder.lastLPAmountSaved
    let timeDiff = currentTimestamp - holder.lastActionTimestamp
    let timeWeightedLPAmount = lastLPAmountSaved.mul(timeDiff)

    holders[log.address_to] = {
      lastLPAmountSaved: lastLPAmountSaved.add(log.amount),
      lastActionTimestamp: currentTimestamp,
      firstObservedTimestamp: holder.firstObservedTimestamp,
      timeWightedLPAmount: holder.timeWightedLPAmount.add(timeWeightedLPAmount)
    }
  } else {
    // No record for log.address_to found.
    // This is the first time this address received this LP token.
    holders[log.address_to] = {
      lastLPAmountSaved: BigNumber.from(log.amount),
      lastActionTimestamp: currentTimestamp,
      firstObservedTimestamp: currentTimestamp,
      timeWightedLPAmount: BigNumber.from(0)
    }
  }
}

function processBurning(holders: Holders, log: LpTransferLog) {
  let currentTimestamp = Math.round(new Date(log.block_timestamp).getTime() / 1000)

  let holder = holders[log.address_from]
  let lastLPAmountSaved = holder.lastLPAmountSaved
  let timeDiff = currentTimestamp - holder.lastActionTimestamp
  let timeWeightedLPAmount = lastLPAmountSaved.mul(timeDiff)

  if (lastLPAmountSaved.sub(log.amount).lt(0)) {
    throw(`user burned (${log.amount}) more than they had (${lastLPAmountSaved})`)
  }

  holders[log.address_from] = {
    lastLPAmountSaved: lastLPAmountSaved.sub(log.amount),
    lastActionTimestamp: currentTimestamp,
    firstObservedTimestamp: holder.firstObservedTimestamp,
    timeWightedLPAmount: holder.timeWightedLPAmount.add(timeWeightedLPAmount)
  }
}

function processTimeWeightedAmount(allHolders: AllHolders): TimeWeightedAmountOutput {
  let output: TimeWeightedAmountOutput = {}

  let currentTimestamp = Math.round(new Date().getTime() / 1000)
  let nonUniqueLPCount = 0

  for (let pool in allHolders) {
    output[pool] = {}
    let holders = allHolders[pool]
    for (let address in holders) {
      let holder = holders[address]
      let timeDiff = currentTimestamp - holder.lastActionTimestamp
      let timeWeightedLPAmount = holder.lastLPAmountSaved.mul(timeDiff)
      holders[address].timeWightedLPAmount = holder.timeWightedLPAmount.add(timeWeightedLPAmount)
      output[pool][address] = holders[address].timeWightedLPAmount.toString()
      nonUniqueLPCount++
    }
    allHolders[pool] = holders

    output[pool] = Object.entries(output[pool])
      .sort(([, a], [, b]) => {
        const bigA = BigNumber.from(a)
        const bigB = BigNumber.from(b)
        return bigA.lt(bigB) ? 1 : bigA.gt(bigB) ? -1 : 0
      })
      .reduce((r, [k, v]) => ({...r, [k]: v}), {})
  }
  console.log(`Non-unique LP count: ${nonUniqueLPCount}`)
  return output
}

function groupByAddress(timeWeightedAmounts: TimeWeightedAmountOutput): TimeWeightedAmountOutputByAddress {
  let output: TimeWeightedAmountOutputByAddress = {}
  let uniqueLPCount = 0

  for (let pool in timeWeightedAmounts) {
    for (let address in timeWeightedAmounts[pool]) {
      if (output.hasOwnProperty(address)) {
        output[address][pool] = timeWeightedAmounts[pool][address]
      } else {
        output[address] = {
          [pool] : timeWeightedAmounts[pool][address]
        }
        uniqueLPCount++
      }
    }
  }
  console.log(`Unique LP count: ${uniqueLPCount}`)
  return output
}

function prettyStringfy(json: any) {
  return JSON.stringify(
    json,
    null,
    '    ')
}

async function loadPriceData(): Promise<PriceData> {
  const data: PriceData = {}

  const rl = readline.createInterface({
    input: fs.createReadStream("./prices.csv"),
  })

  for await (const line of rl) {
    let [tsRaw, price, asset] = line.split(',')

    let ts = Number(tsRaw)

    if (!data[ts]) {
      data[ts] = {
        BTC: "",
        ETH: ""
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

async function processAllLogs() {
  let allHolders: AllHolders = {
    BTC: {},
    USD: {},
    vETH2: {},
    alETH: {},
    d4: {}
  }
  let rewards: { [address: string]: BigNumber} = {}
  const totalPoolLPTokens: { [pool: string] : BigNumber} = {}

  // Load price data
  const priceData = await loadPriceData()

  // Pre-process logs to group them by block
  let logsByBlock: Map<number, LpTransferLog[]> = new Map<number, LpTransferLog[]>()
  for (let log of lpTransferLogs) {
    const { block_number: raw } = log
    // TODO: why does this not work without explicitly casting?
    const block_number = Number(raw)

    let logs: LpTransferLog[] = []
    if (logsByBlock.has(block_number)) {
      logs = logsByBlock.get(block_number)
    }
    logs.push(log)
    logsByBlock.set(block_number, logs)
  }

  let ts: number
  for (let block = START_BLOCK; block <= END_BLOCK; block++) {
    if (block % 10000 === 0) {
      console.log(`Processing block ${block}...`)
    }

    // Update state for the current block if there are transactions
    if (logsByBlock.has(block)) {
      // console.log(`Found logs: ${JSON.stringify(logsByBlock.get(block))}`)

      const blocks = logsByBlock.get(block)
      // Parse and truncate the timestamp to minute level precision for retrieving pricing data
      const parsed = Date.parse(blocks[0].block_timestamp) / 1000
      ts = parsed - parsed % 60

      // Filter blocks by transaction type for processing
      const minting = blocks.filter(log => log.address_from === "0x0000000000000000000000000000000000000000")
      const burning = blocks.filter(log => log.address_to === "0x0000000000000000000000000000000000000000")
      const transfers = blocks.filter(log => (log.address_from !== "0x0000000000000000000000000000000000000000" && log.address_to !== "0x0000000000000000000000000000000000000000"))

      // Process minting before burning
      for (let log of [...minting, ...transfers]) {
        let holders = allHolders[log.pool];
        processMinting(holders, log);
        allHolders[log.pool] = holders;
      }

      for (let log of [...burning, ...transfers]) {
        let holders = allHolders[log.pool];
        processBurning(holders, log);
        allHolders[log.pool] = holders;
      }

      // Update LP token balances for each pool, we only do this when there are logs as an optimization
      for (let pool in allHolders) {
        let totalLP = BigNumber.from(0)
        let holders = allHolders[pool]
        for (let address in holders) {
          totalLP = totalLP.add(holders[address].lastLPAmountSaved)
        }
        totalPoolLPTokens[pool] = totalLP
      }
    } else {
      // If there were no logs for a particular block we don't have the unix timestamp, so estimate it
      const estimate = START_BLOCK_TS + ((block - START_BLOCK) * AVERAGE_BLOCK_TIME)
      ts = estimate - estimate % 60
    }

    // Calculate total pool USD TVL
    let totalUSDTVL = BigNumber.from(0)
    for (let pool in allHolders) {
      if (pool === "BTC") {
        totalUSDTVL = totalUSDTVL.add(totalPoolLPTokens[pool].mul(ethers.utils.parseUnits(priceData[ts].BTC, 2)))
      } else if (pool === "vETH2" || pool === "alETH") {
        totalUSDTVL = totalUSDTVL.add(totalPoolLPTokens[pool].mul(ethers.utils.parseUnits(priceData[ts].ETH, 2)))
      } else {
        totalUSDTVL = totalUSDTVL.add(totalPoolLPTokens[pool])
      }
    }

    // Distribute tokens
    for (let pool in allHolders) {
      let holders = allHolders[pool]
      for (let address in holders) {
        let userShare = holders[address].lastLPAmountSaved
        if (!rewards[address]) rewards[address] = BigNumber.from(0)
        if (pool === "BTC") {
          rewards[address] = rewards[address].add(userShare.mul(ethers.utils.parseUnits(priceData[ts].BTC, 2)).mul(TOKENS_PER_BLOCK).div(totalUSDTVL))
        } else if (pool === "vETH2" || pool === "alETH") {
          rewards[address] = rewards[address].add(userShare.mul(ethers.utils.parseUnits(priceData[ts].ETH, 2)).mul(TOKENS_PER_BLOCK).div(totalUSDTVL))
        } else {
          rewards[address] = rewards[address].add(userShare.mul(TOKENS_PER_BLOCK).div(totalUSDTVL))
        }
      }
    }
  }

  // Sanity check the distribution
  let totalRewardsDistributed = BigNumber.from(0)
  for (const [_, reward] of Object.entries(rewards)) {
    totalRewardsDistributed = totalRewardsDistributed.add(reward)
  }

  console.assert(ethers.utils.formatUnits(totalRewardsDistributed, 18) === String(TOTAL_LP_TOKENS), `rewards did not match (got, expected): ${ethers.utils.formatUnits(totalRewardsDistributed, 18) }, ${TOTAL_LP_TOKENS}`)

  // Write the allHolders object as JSON
  fs.writeFile("./json/retroactive_lp_timeweighted_detailed.json", prettyStringfy(allHolders), 'utf8' ,() => {})

  // Clean up allHolders objects to have only timeweighted amounts
  const timeWeightedAmountOutput = processTimeWeightedAmount(allHolders)
  fs.writeFile("./json/retroactive_lp_timeweighted.json", prettyStringfy(timeWeightedAmountOutput), 'utf8' ,() => {})

  // Group by addresses
  const timeWeightedAmountOutputGroupedByAddress = groupByAddress(timeWeightedAmountOutput)
  fs.writeFile("./json/retroactive_lp_timeweighted_by_address.json", prettyStringfy(timeWeightedAmountOutputGroupedByAddress), 'utf8' ,() => {})
}

processAllLogs()

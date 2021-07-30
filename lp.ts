import * as data from './json/retroactive_lp.json'

import {BigNumber} from 'ethers';
import fs from 'fs'

const START_BLOCK = 11685572
const END_BLOCK = 12923115
const TOTAL_LP_TOKENS = 120_000_000
const TOTAL_BLOCKS = END_BLOCK - START_BLOCK
const TOKENS_PER_BLOCK = TOTAL_LP_TOKENS / TOTAL_BLOCKS

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

function processAllLogs() {
  let allHolders: AllHolders = {
    BTC: {},
    USD: {},
    vETH2: {},
    alETH: {},
    d4: {}
  }

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

  for (let block = START_BLOCK; block <= END_BLOCK; block++) {
    // console.log(`Processing block ${block}...`)

    // Update state for the current block if there are transactions
    if (logsByBlock.has(block)) {
      console.log(`Found logs: ${JSON.stringify(logsByBlock.get(block))}`)

      const blocks = logsByBlock.get(block)
      const minting = blocks.filter(log => log.address_from === "0x0000000000000000000000000000000000000000")
      const burning = blocks.filter(log => log.address_to === "0x0000000000000000000000000000000000000000")
      const transfers = blocks.filter(log => (log.address_from !== "0x0000000000000000000000000000000000000000" && log.address_to !== "0x0000000000000000000000000000000000000000"))

      console.log(blocks.length, minting.length, burning.length, transfers.length)

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

      // Distribute tokens
      for (let pool in allHolders) {
        let total = BigNumber.from(0)
        let holders = allHolders[pool]
        for (let address in holders) {
          total = total.add(holders[address].lastLPAmountSaved)
        }

        console.log(`Total LP tokens for ${pool}: ${total}`)
      }
    }
  }


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

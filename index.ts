import {BigNumber} from 'ethers';
import * as data from './json/retroactive_lp.json'
import fs from 'fs'

let lpTransferLogs: LpTransferLog[] = data["default"]

interface LpTransferLog {
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
    throw("user burned more than they had")
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

  for (let log of lpTransferLogs) {
    let holders = allHolders[log.pool]

    // Minting
    if (log.address_from == "0x0000000000000000000000000000000000000000") {
      processMinting(holders, log)
    }
    // Burning
    else if (log.address_to == "0x0000000000000000000000000000000000000000") {
      processBurning(holders, log)
    }
    // Transfer between accounts
    else {
      processMinting(holders, log)
      processBurning(holders, log)
    }

    // Update the allHolders object
    allHolders[log.pool] = holders
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
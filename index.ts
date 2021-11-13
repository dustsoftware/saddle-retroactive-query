import * as data from "./json/retroactive_lp.json"

import { BigNumber, ethers } from "ethers"

import fs from "fs"
import readline from "readline"

// Minute granularity BTC and ETH price data is downloaded from: https://duneanalytics.com/queries/95400

// The first swap was deployed on block 11685572, but we instead use the first block that liquidity was added
const START_BLOCK = 11686727
const START_BLOCK_TS = 1611072272
const GUARDED_LAUNCH_END_BLOCK = 11909762 // https://etherscan.io/tx/0xedc38ea0b5f1cc740c6659cdecdc5b379bcd77b1eae59709d41e9811b92a4d66
const END_BLOCK = 13527859
const AVERAGE_BLOCK_TIME = 13 // used to estimate the timestamps for blocks we do not have logs for
const TOTAL_LP_TOKENS = 105_000_000
// Double count the guarded launch since LP'ing during counts for 2X the duration
const TOTAL_BLOCKS =
  END_BLOCK - START_BLOCK + (GUARDED_LAUNCH_END_BLOCK - START_BLOCK)
const TOKENS_PER_BLOCK = ethers.utils.parseUnits(
  String(TOTAL_LP_TOKENS / TOTAL_BLOCKS),
  18,
)
const LP_TOKEN_ADDRESS_MAP = new Map(
  Object.entries({
    "0xc28df698475dec994be00c9c9d8658a548e6304f": "BTC",
    "0x76204f8cfe8b95191a3d1cfa59e267ea65e06fac": "USD",
    "0xe37e2a01fea778bc1717d72bd9f018b6a6b241d5": "vETH2",
    "0xc9da65931abf0ed1b74ce5ad8c041c4220940368": "alETH",
    "0xd48cf4d7fb0824cc8bae055df3092584d0a1726a": "d4",
    "0x5f86558387293b6009d7896a61fcc86c17808d62": "USDv2",
    "0x8fa31c1b33de16bf05c38af20329f22d544ad64c": "sUSD",
    "0xf32e91464ca18fc156ab97a697d6f8ae66cd21a3": "BTCv2",
    "0x122eca07139eb368245a29fb702c9ff11e9693b7": "tBTCv2",
    "0x78179d49c13c4eca14c69545ec172ba0179eae6b": "WCUSD",
  }),
)

const STAKING_CONTRACT_ADDRESSES = new Set([
  "0x78aa83bd6c9de5de0a2231366900ab060a482edd", // BTC pool staking for KEEP rewards
  "0xab8e74017a8cc7c15ffccd726603790d26d7deca", // alETH pool staking for ALCX rewards
  "0x0639076265e9f88542c91dcdeda65127974a5ca5", // d4 communal farm
  "0xcf91812631e37c01c443a4fa02dfb59ee2ddba7c", // vETH2 staking for SGT
  "0x6ad9e8e5236c0e2cf6d755bb7be4eabcbc03f76d", // tBTCv2 metapool staking for KEEP rewards
  "0x6f27c4e4888a7090cad2e1b82d6e02ebb4fa06ec", // vETH2 masterchef
  "0x6847259b2b3a4c17e7c43c54409810af48ba5210", // pickle controller
  "0xe6487033f5c8e2b4726af54ca1449fec18bd1484", // pickling d4
  "0x4a974495e20a8e0f5ce1de59eb15cfffd19bcf8d", // StrategySaddleD4
  "0x4f1f43b54a1d88024d26ad88914e6fcfe0024cb6", // StrategySaddleD4
  "0xcf40e2d98b5fa0c666a6565558ad20b3f6742d46", // pickling saddlealeth
  "0x0185ee1a1101f9c43c6a33a48faa7edb102f1e30", // StrategySaddleAlethEth
])

const METAPOOL_ADDRESSES = new Set([
  "0xf74ebe6e5586275dc4ced78f5dbef31b1efbe7a5", "0x0c8bae14c9f9bf2c953997c881befac7729fd314", "0x3f1d224557afa4365155ea77ce4bc32d5dae2174"
])

const lpTransferLogs: LPTransferLog[] = data["default"]

interface LPTransferLog {
  block_number: number
  block_timestamp: string
  address_from: string
  address_to: string
  amount: string
  token: string
}

type Holders = Map<
  string,
  {
    lastLPAmountSaved: BigNumber
    lastActionTimestamp: number
    firstObservedTimestamp: number
  }
>

type AllHolders = Map<string, Holders>
type TotalPoolLPTokens = Map<string, BigNumber>

interface MinutePriceData {
  BTC: string
  ETH: string
}

type PriceData = Map<number, MinutePriceData>

function processMinting(
  holders: Holders,
  tokens: TotalPoolLPTokens,
  log: LPTransferLog,
) {
  const { block_timestamp, token, amount, address_to } = log
  if (amount === "0") {
    return
  }

  const currentTimestamp = Math.round(
    new Date(block_timestamp).getTime() / 1000,
  )

  tokens.set(LP_TOKEN_ADDRESS_MAP.get(token), tokens.get(LP_TOKEN_ADDRESS_MAP.get(token)).add(amount))
  if (holders.has(address_to)) {
    const holderData = holders.get(address_to)

    holderData.lastActionTimestamp = currentTimestamp
    holderData.lastLPAmountSaved = holderData.lastLPAmountSaved.add(amount)
  } else {
    // No record for log.address_to found.
    // This is the first time this address received this LP token.
    holders.set(address_to, {
      lastLPAmountSaved: BigNumber.from(amount),
      lastActionTimestamp: currentTimestamp,
      firstObservedTimestamp: currentTimestamp,
    })
  }
}

function processBurning(
  holders: Holders,
  tokens: TotalPoolLPTokens,
  log: LPTransferLog,
) {
  const { block_timestamp, token, amount, address_from } = log

  if (!holders.has(address_from)) {
    console.log(`Something went wrong. Could not identify minting!`)
    console.log(log)
    return
  }

  if (amount === "0") {
    return
  }

  const holderData = holders.get(address_from)
  const currentTimestamp = Math.round(
    new Date(block_timestamp).getTime() / 1000,
  )

  let thisLPAmount: BigNumber

  if (holderData.lastLPAmountSaved.lt(amount)) {
    console.warn(
      `user burned (${amount}) more than they had (${holderData.lastLPAmountSaved})`,
    )
    console.log(log)
    thisLPAmount = BigNumber.from(0)
  } else {
    thisLPAmount = holderData.lastLPAmountSaved.sub(amount)
  }

  const lpTokenName = LP_TOKEN_ADDRESS_MAP.get(token)
  tokens.set(lpTokenName, tokens.get(lpTokenName).sub(amount))

  holderData.lastLPAmountSaved = thisLPAmount
  holderData.lastActionTimestamp = currentTimestamp
}

function prettyStringify(json: any) {
  return JSON.stringify(json, null, "    ")
}

async function loadPriceData(): Promise<PriceData> {
  const data: PriceData = new Map<number, MinutePriceData>()
  const rl = readline.createInterface({
    input: fs.createReadStream("./prices.csv"),
  })

  for await (const line of rl) {
    const [tsRaw, price, asset] = line.split(",")
    const ts = Number(tsRaw)

    if (!data.has(ts)) {
      data.set(ts, {
        BTC: "",
        ETH: "",
      })
    }

    if (asset === "BTC") {
      data.get(ts).BTC = price
    } else if (asset === "ETH") {
      data.get(ts).ETH = price
    }
  }

  return data
}

function getTokenPrice(pool: string, priceData: MinutePriceData): BigNumber {
  let tokenPrice = BigNumber.from(100)
  if (pool.includes("BTC")) {
    tokenPrice = ethers.utils.parseUnits(priceData.BTC, 2)
  } else if (pool.includes("ETH")) {
    tokenPrice = ethers.utils.parseUnits(priceData.ETH, 2)
  }
  return tokenPrice
}

async function processAllLogs() {
  const allHolders: AllHolders = new Map<string, Holders>(
    Object.entries({
      BTC: new Map(),
      USD:  new Map(),
      vETH2:  new Map(),
      alETH:  new Map(),
      d4:  new Map(),
      USDv2:  new Map(),
      sUSD:  new Map(),
      BTCv2:  new Map(),
      tBTCv2:  new Map(),
      WCUSD:  new Map(),
    }),
  )
  const lpTokens: TotalPoolLPTokens = new Map<string, BigNumber>(
    Object.entries({
      BTC: BigNumber.from(0),
      USD: BigNumber.from(0),
      vETH2: BigNumber.from(0),
      alETH: BigNumber.from(0),
      d4: BigNumber.from(0),
      USDv2: BigNumber.from(0),
      sUSD: BigNumber.from(0),
      BTCv2: BigNumber.from(0),
      tBTCv2: BigNumber.from(0),
      WCUSD: BigNumber.from(0),
    }),
  )
  const rewards = new Map<string, BigNumber>()

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
      // Don't process deposit or withdraw txs from staking/farm contracts
      const transfers = blocks.filter(
        (log) =>
          log.address_from !== "0x0000000000000000000000000000000000000000" &&
          log.address_to !== "0x0000000000000000000000000000000000000000" &&
          !STAKING_CONTRACT_ADDRESSES.has(log.address_from) &&
          !STAKING_CONTRACT_ADDRESSES.has(log.address_to),
      )

      // Process minting before burning
      for (const log of [...minting, ...transfers]) {
        const lpTokenName = LP_TOKEN_ADDRESS_MAP.get(log.token)
        processMinting(allHolders.get(lpTokenName), lpTokens, log)
      }

      for (const log of [...burning, ...transfers]) {
        const lpTokenName = LP_TOKEN_ADDRESS_MAP.get(log.token)
        processBurning(allHolders.get(lpTokenName), lpTokens, log)
      }
    } else {
      // If there were no logs for a particular block we don't have the unix timestamp, so estimate it
      const estimate =
        START_BLOCK_TS + (block - START_BLOCK) * AVERAGE_BLOCK_TIME
      ts = estimate - (estimate % 60)
    }

    // Temporary object to store token prices at current block number
    const tokenPrices = new Map<string, BigNumber>()

    // Calculate total pool USD TVL
    let totalUSDTVL = BigNumber.from(0)
    for (const [pool, holders] of allHolders) {
      const tokenPrice = getTokenPrice(pool, priceData.get(ts))
      tokenPrices.set(pool, tokenPrice)

      // Add to total TVL
      totalUSDTVL = totalUSDTVL.add(lpTokens.get(pool).mul(tokenPrice))

      // Account for double counting assets inside meta pool
      for (const metapoolAddress of METAPOOL_ADDRESSES) {
        if (holders.has(metapoolAddress)) {
          const metapoolBaseLPAmount = holders.get(metapoolAddress).lastLPAmountSaved
          totalUSDTVL = totalUSDTVL.sub(
            metapoolBaseLPAmount.mul(tokenPrice),
          )
        }
      }
    }

    // Distribute tokens
    const reward =
      block < GUARDED_LAUNCH_END_BLOCK
        ? TOKENS_PER_BLOCK.mul(2)
        : TOKENS_PER_BLOCK

    for (const [pool, holders] of allHolders) {
      for (const [address, holderData] of holders) {
        // Dont give rewards to the metapool addresses
        if (METAPOOL_ADDRESSES.has(address)) {
          continue
        }

        // Give rewards to users
        const userLPAmount = holderData.lastLPAmountSaved

        let prevBalance = BigNumber.from(0)
        if (rewards.has(address)) {
          prevBalance = rewards.get(address)
        }

        rewards.set(address, prevBalance.add(
          userLPAmount.mul(tokenPrices.get(pool)).mul(reward).div(totalUSDTVL),
        ))
      }
    }
  }

  // Sanity check the distribution and convert BigNumber to string for output
  const output: { [address: string]: string } = {}
  let totalRewardsDistributed = BigNumber.from(0)
  for (const [address, reward] of rewards) {
    // Remove 0 reward addresses
    if (reward.eq(0)) {
      delete output[address]
      continue
    }
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

  // Sort by total dollar value swapped amounts
  const sortedOutput = Object.entries(output)
    .sort(([, a], [, b]) => (BigNumber.from(a).lt(BigNumber.from(b)) ? 1 : -1))
    .reduce((r, [k, v]) => ({ ...r, [k]: v }), {})

  // Write the rewards object as JSON
  await fs.promises.writeFile(
    "./json/retroactive_lp_rewards.json",
    prettyStringify(sortedOutput),
    "utf8",
  )
}

processAllLogs()

import * as data from "./json/retroactive_swap.json"

import { BigNumber, ethers } from "ethers"

import fs from "fs"
import readline from "readline"

interface SwapLog {
  pool: string
  block_timestamp: string
  buyer: string
  tokensSold: string
  tokensBought: string
  soldId: string
  boughtId: string
}

interface Swappers {
  [address: string]: number
}

interface MinutePriceData {
  BTC: string
  ETH: string
}

interface PriceData {
  [timestamp: number]: MinutePriceData
}

const swapLogs: SwapLog[] = data["default"]

const POOL_ADDRESS_MAP = {
  "0x4f6a43ad7cba042606decaca730d4ce0a57ac62e" : "BTC",
  "0x3911f80530595fbd01ab1516ab61255d75aeb066" : "USD",
  "0xdec2157831d6abc3ec328291119cc91b337272b5" : "vETH2",
  "0xa6018520eaacc06c30ff2e1b3ee2c7c22e64196a" : "alETH",
  "0xc69ddcd4dfef25d8a793241834d4cc4b3668ead6" : "d4",
  "0xacb83e0633d6605c5001e2ab59ef3c745547c8c7" : "USDv2",
  "0x0c8bae14c9f9bf2c953997c881befac7729fd314" : "sUSD",
  "0xdf3309771d2bf82cb2b6c56f9f5365c8bd97c4f2" : "BTCv2",
  "0xf74ebe6e5586275dc4ced78f5dbef31b1efbe7a5" : "tBTCv2",
  "0x3f1d224557afa4365155ea77ce4bc32d5dae2174" : "WCUSD"
}

const POOL_ASSET_DECIMAL_MAP = {
  "0x4f6a43ad7cba042606decaca730d4ce0a57ac62e" : [18, 8, 8, 18],
  "0x3911f80530595fbd01ab1516ab61255d75aeb066" : [18, 6, 6],
  "0xdec2157831d6abc3ec328291119cc91b337272b5" : [18, 18],
  "0xa6018520eaacc06c30ff2e1b3ee2c7c22e64196a" : [18, 18, 18],
  "0xc69ddcd4dfef25d8a793241834d4cc4b3668ead6" : [18, 18, 18, 18],
  "0xacb83e0633d6605c5001e2ab59ef3c745547c8c7" : [18, 6, 6],
  "0x0c8bae14c9f9bf2c953997c881befac7729fd314" : [18, 18],
  "0xdf3309771d2bf82cb2b6c56f9f5365c8bd97c4f2" : [8, 8, 18],
  "0xf74ebe6e5586275dc4ced78f5dbef31b1efbe7a5" : [18, 18],
  "0x3f1d224557afa4365155ea77ce4bc32d5dae2174" : [18, 18]
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
  let tokenPrice = BigNumber.from(100)
  if (pool.includes("BTC")) {
    tokenPrice = ethers.utils.parseUnits(priceData.BTC, 2)
  } else if (pool.includes("ETH")) {
    tokenPrice = ethers.utils.parseUnits(priceData.ETH, 2)
  }
  return tokenPrice
}

async function processSwaps() {
  const swappers: Swappers = {}
  const priceData = await loadPriceData()

  for (const swapLog of swapLogs) {

    // Sanity check pool addresses
    if (!POOL_ADDRESS_MAP.hasOwnProperty(swapLog.pool)) {
      throw `could not recognize pool address ${swapLog.pool}`
    }

    // Get timestamp by 1 minute interval
    let ts: number
    const parsed = Date.parse(swapLog.block_timestamp) / 1000
    ts = parsed - (parsed % 60)

    // Calculate USD value of the tokens sold by the given address
    const tokenPrice = getTokenPrice(POOL_ADDRESS_MAP[swapLog.pool], priceData[ts])
    const tokenSold = ethers.utils.formatUnits(swapLog.tokensSold, POOL_ASSET_DECIMAL_MAP[swapLog.pool][parseInt(swapLog.soldId)])
    const soldValue = parseFloat(tokenSold) * tokenPrice.toNumber() / 100

    console.log(`${swapLog.buyer} sold ${tokenSold} ${POOL_ADDRESS_MAP[swapLog.pool]}`)

    if (!swappers.hasOwnProperty(swapLog.buyer)) {
      // First time a swap happened from the address
      swappers[swapLog.buyer] = soldValue
    } else {
      // Else sum up the previous value
      swappers[swapLog.buyer] = swappers[swapLog.buyer] + soldValue
    }
  }

  // Sort by total dollar value swapped amounts
  const output = Object.entries(swappers)
    .sort(([,a],[,b]) => a-b)
    .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

  // Write the addresses object as JSON
  await fs.promises.writeFile(
    "./json/retroactive_swap_addresses.json",
    prettyStringify(output),
    "utf8",
  )
}

processSwaps()
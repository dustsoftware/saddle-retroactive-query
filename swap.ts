import * as data from "./json/retroactive_swap.json"

import { BigNumber, ethers } from "ethers"

import fs from "fs"
import readline from "readline"

// 0.5% of 1B tokens is split between people who swapped through Saddle based on swap sizes
const TOTAL_REWARD_TOKENS = 5_000_000
const TOTAL_REWARD_TOKENS_BIGNUMBER = ethers.utils.parseUnits(TOTAL_REWARD_TOKENS.toString(), 18)

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

const BLOCK_LIST = [
  '0x4f6a43ad7cba042606decaca730d4ce0a57ac62e',
  '0x21a0ca9064e46d7fb0145365a897ebecfff52677',
  '0x8ee5ee714adb4513ac682cbfc3122b85fd288be9',
  '0x19270be884763562361677a305a1250dbc8b75f8',
  '0x4c7081307a91177655ea1802d99595cb49ef5a99',
  '0x93eb7e6e64bdcf8af8231bc8a284135a23f56d09',
  '0x910e985623e79f9d3901b75b99b38d5480e2d1a6',
  '0x69c9c08c3531cc5c0fd6014adb7f670532cdc43e',
  '0x789b7315eb095e6d00f616ed427a7e7eda03f3d3',
  '0x0f28619684e57f5ffd21c6e9af55694b6235046e',
  '0x42f1614d2b19041cdd9872fe9ba803d260e64a94',
  '0x6de5f1772d422b8e3f7ede0f705ad9a21e351a6f',
  '0xa4cbb26b8ff855cd18c151c8c1351953c2955ab9',
  '0x36e480542adb535cd15df1303748a5298b033952',
  '0x4d1f84c10ebe86de55317265f8a855bad119cf64',
  '0x0e0c74c535689564c0c5806470eb5394d5d9c207',
  '0x298542fdec1b23d1bec2987dceedcc3eaa960858',
  '0x6da516ec1b135b23778a421cfe50340fe7c99363',
  '0x42822fba1ae09b5aeb7e06c6104232114f3c822a',
  '0x74797aa63403905131a5589269b5401ad43cb018',
  '0xd8ac7f37c08e3797f77197d363e7328b3d2cce3d',
  '0xf50506e3a1a5c150fd01113f8a7b044d0c20fbe9',
  '0xfc281b0ceb5dea914e5790d281eae81fde067228',
  '0xca8c4e133c92292ced38b34b5a0697b02d8a6caf',
  '0x9e8d4b8575d814c5012bbf04a1e251d81ec4d627',
  '0x1562c3ee780964c1fe1e95ba6ab22962a96cb12e',
  '0x094f318f73670ca1deee1e94bbe8d6b573db0872',
  '0x35334e0f6223be2da00d9f316339c64d3507334d',
  '0x61dac98eeeb0ba429468eca3cebec9b5c8f4b2a0',
  '0xbbe71d844bf28bc7d9334a19bb4c84a19f150298',
  '0x7d5e1e1f96a50324715bb118f8ae8b6649d987a2',
  '0xbe6879f28f87a11e881509a2f9e5fc1ec9215a96',
  '0x50aa5bfcd9d07d8a08d2658018fdce0621a18eef',
  '0x298542fdec1b23d1bec2987dceedcc3eaa960858',
  '0x1a874798a8521174ea5f9d07e92c17e24ccff383',
  '0xd8a6a21ea8d868c37a09e27838e15f119452b07a',
  '0xb4d266198f406b2c358696242e981e389977f279',
  '0xdeafea012c3617378511d3fc8dc277354388c9ad',
  '0x51d2cb51c57c4efc0a75ffe40ae9cd724d6ebf04',
  '0x0530fbb21dd9140f072f3d41073b3e8c60106ea1',
  '0xac179e0a41f1cc4db42513520f762f1d57ae6ed6',
  '0x85d25644526693897a3417fe149639e4422dc44b',
  '0xa3aaac039c2c934c3675e1aae847bc7d2254505d',
  '0x1eda03afc1100ed5e02333150ae301d0f61fde21',
  '0x7cab57893a1e796537b543a1144e1a1f6c170fa1',
  '0xe0e14f967629f54e30a44408ebd9962edee65e25',
  '0x6f914408be952200149e6f36fc13cad58028603e',
  '0xc72cbd909a3d755ce42ec8e7641bf0c531f6213b',
  '0x77b4619fd0a82bdbbd76d41b2c9e9f3d78c9eb6f',
  '0x8e0ffdeabbb0dc652e02460dd44aa3c54dfd2954',
  '0xf4ec77ef0c2cdc00d736614028b153694db5e16f',
  '0x36a7875f0247b2d857f76ae32efbef0c32bee07d',
  '0x19b36216934c567f5c87c7c2f2eade7385198392',
  '0x746cf079a50addd7ff1a11b4606907a30cb81b3a',
  '0x2a3b4c526264bdb46cf2dda1aa20c6b151714659',
  '0x360f2ba1bc1fb1e56ac7eed7739dd6db694d1d70',
  '0x1f49cb6bc216ed06cf420f9a83fb50fddc465928',
  '0x656833562aa937766b767cc8976dcecabcbf5f9d',
  '0x07333f178ca73cb1e50060c73a99048f3693aae4',
  '0x5e9af368d0000734b740c1205dd22f07eb96411e',
  '0x8bb6a8a802c6240a6dc5c74dded3f3901507524a',
  '0x66690e4cdb2d9ee9df49d4e2c1b2ac26c4a0595d',
  '0x11f05bf3865055fc53d8cb92da21029a90f245bf',
  '0x2cf96a2534aabb11e201f0711d5da080c01c990e',
  '0x2b3f9c0a2d0ecd565caf1a208727a7419506fa98',
  '0x6bce0e6927b145ded926e361b2edafb5fe07a6bb',
  '0x6159a7c5bcb27387cb96f0113b48bd9ce0583764',
  '0xcc5a3ea94ea5f7aa8eee2ac045cb7492a89448ae',
  '0x643ea5357b3dd4700c0a3d48d4b712d35163df7b',
  '0xe3c67f22b45e8de9f2a5aebbbe75dce56383fda0',
  '0x8752237f0d25529e3380b56aea1c8fb5cb3cff1b',
  '0xe4fd533ef337fb8f91d7b515ccc631c494b55e3b',
  '0xabbf83845eabb128587eecbfe98c1a50a7057e1b',
  '0x8a637a94b9e5163a13b2d33c44c9f137387d35a5',
  '0x01122ae3d7ba9fbd2f5fff3c9b8dbf4b21622a47',
  '0x28d804bf2212e220bc2b7b6252993db8286df07f',
  '0x28666c39d680f6212163f02030b45b0ee3a6e261',
  '0x1c051112075feaee33bcdbe0984c2bb0db53cf47'
]

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

  let totalSwapValue = 0
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
    const soldValue = (parseFloat(tokenSold) * tokenPrice.toNumber() / 100)

    console.log(`${swapLog.buyer} sold ${tokenSold} ${POOL_ADDRESS_MAP[swapLog.pool]}`)

    if (!swappers.hasOwnProperty(swapLog.buyer)) {
      // First time a swap happened from the address
      swappers[swapLog.buyer] = soldValue
    } else {
      // Else sum up the previous value
      swappers[swapLog.buyer] = swappers[swapLog.buyer] + soldValue
    }
    totalSwapValue += soldValue
  }

  // Sort by total dollar value swapped amounts
  const output = Object.entries(swappers)
    .sort(([,a],[,b]) => b-a)
    .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

  // Write the addresses object as JSON
  await fs.promises.writeFile(
    "./json/retroactive_swap_addresses.json",
    prettyStringify(output),
    "utf8",
  )

  // Calculate how much each address should get
  let totalRewards = BigNumber.from(0)
  let numberOfEligibleWallets = 0
  for (const [address, swapValue] of Object.entries(output)) {
    // If total swap value is less than 100 or is included in the block list, no rewards.
    if (swapValue <= 100 || BLOCK_LIST.includes(address)) {
      delete output[address]
    } else {
      numberOfEligibleWallets++
    }
  }

  // Set the rewards
  const rewardPerAddr = TOTAL_REWARD_TOKENS_BIGNUMBER
    .div(numberOfEligibleWallets)

  for (const [address, ] of Object.entries(output)) {
    totalRewards = totalRewards.add(rewardPerAddr)
    output[address] = rewardPerAddr.toString()
  }

  // Sanity check rewards
  console.assert(
    totalRewards.eq(TOTAL_REWARD_TOKENS_BIGNUMBER),
    `rewards did not match (got, expected): ${totalRewards.toString()}, ${TOTAL_REWARD_TOKENS_BIGNUMBER.toString()}`,
  )

  // Write the addresses object as JSON
  await fs.promises.writeFile(
    "./json/retroactive_swap_rewards.json",
    prettyStringify(output),
    "utf8",
  )
}

processSwaps()
BEGIN

    CREATE TEMP FUNCTION
        PARSE_SADDLE_SWAP_EVENTS(data STRING, topics ARRAY <STRING>)
        RETURNS STRUCT <`buyer` STRING, `tokensSold` STRING, `tokensBought` STRING, `soldId` STRING, `boughtId` STRING>
        LANGUAGE js AS """
    const parsedEvent = {
        "anonymous": false,
        "inputs": [{"indexed":true,"internalType":"address","name":"buyer","type":"address"},{"indexed":false,"internalType":"uint256","name":"tokensSold","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"tokensBought","type":"uint256"},{"indexed":false,"internalType":"uint128","name":"soldId","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"boughtId","type":"uint128"}],
        "name": "TokenSwap",
        "type": "event"
    }
    return abi.decodeEvent(parsedEvent, data, topics, false);
"""
        OPTIONS
            ( library = "https://storage.googleapis.com/ethlab-183014.appspot.com/ethjs-abi.js" );

    CREATE TABLE retroactive_swap
    AS
        (
            SELECT logs.address                                                  as pool,
                   PARSE_SADDLE_SWAP_EVENTS(logs.data, logs.topics).buyer        as buyer,
                   PARSE_SADDLE_SWAP_EVENTS(logs.data, logs.topics).tokensSold   as tokensSold,
                   PARSE_SADDLE_SWAP_EVENTS(logs.data, logs.topics).tokensBought as tokensBought,
                   PARSE_SADDLE_SWAP_EVENTS(logs.data, logs.topics).soldId       as soldId,
                   PARSE_SADDLE_SWAP_EVENTS(logs.data, logs.topics).boughtId     as boughtId,
                   "Swap" as type

            FROM `bigquery-public-data.crypto_ethereum.logs` AS logs
            WHERE (address = '0x4f6a43ad7cba042606decaca730d4ce0a57ac62e' OR -- BTC pool
                   address = '0x3911f80530595fbd01ab1516ab61255d75aeb066' OR -- USD pool
                   address = '0xdec2157831d6abc3ec328291119cc91b337272b5' OR -- vETH2 pool
                   address = '0xa6018520eaacc06c30ff2e1b3ee2c7c22e64196a' OR -- alETH pool
                   address = '0xc69ddcd4dfef25d8a793241834d4cc4b3668ead6' OR -- d4 pool
                   address = '0xaCb83E0633d6605c5001e2Ab59EF3C745547C8C7' OR -- USDv2 pool
                   address = '0x0C8BAe14c9f9BF2c953997C881BEfaC7729FD314' OR -- sUSD metapool
                   address = '0xdf3309771d2BF82cb2B6C56F9f5365C8bD97c4f2' OR -- BTCv2 pool
                   address = '0xf74ebe6e5586275dc4CeD78F5DBEF31B1EfbE7a5' OR -- tBTCv2 metapool
                   address = '0x3F1d224557afA4365155ea77cE4BC32D5Dae2174') -- WCUSD metapool
              AND topics[SAFE_OFFSET(0)] = '0xc6c1e0630dbe9130cc068028486c0d118ddcea348550819defd5cb8c257f8a38' -- "TokenSwap" event
              AND block_number <= 13330090 -- 2021-10-01 00:00:00
        );

END;

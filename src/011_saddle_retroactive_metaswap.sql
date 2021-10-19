BEGIN

    CREATE TEMP FUNCTION
        PARSE_SADDLE_SWAP_EVENTS(data STRING, topics ARRAY <STRING>)
        RETURNS STRUCT <`buyer` STRING, `tokensSold` STRING, `tokensBought` STRING, `soldId` STRING, `boughtId` STRING>
        LANGUAGE js AS """
    const parsedEvent = {
        "anonymous":false,
        "inputs":[{"indexed":true,"internalType":"address","name":"buyer","type":"address"},{"indexed":false,"internalType":"uint256","name":"tokensSold","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"tokensBought","type":"uint256"},{"indexed":false,"internalType":"uint128","name":"soldId","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"boughtId","type":"uint128"}],
        "name":"TokenSwapUnderlying",
        "type":"event"
    }
    return abi.decodeEvent(parsedEvent, data, topics, false);
"""
        OPTIONS
            ( library = "https://storage.googleapis.com/ethlab-183014.appspot.com/ethjs-abi.js" );

    INSERT INTO retroactive_swap
        (
            SELECT logs.address                                                  as pool,
                   PARSE_SADDLE_SWAP_EVENTS(logs.data, logs.topics).buyer        as buyer,
                   PARSE_SADDLE_SWAP_EVENTS(logs.data, logs.topics).tokensSold   as tokensSold,
                   PARSE_SADDLE_SWAP_EVENTS(logs.data, logs.topics).tokensBought as tokensBought,
                   PARSE_SADDLE_SWAP_EVENTS(logs.data, logs.topics).soldId       as soldId,
                   PARSE_SADDLE_SWAP_EVENTS(logs.data, logs.topics).boughtId     as boughtId,
                   "Metaswap"                                                    as type

            FROM `bigquery-public-data.crypto_ethereum.logs` AS logs
            WHERE (address = '0x0C8BAe14c9f9BF2c953997C881BEfaC7729FD314' OR -- sUSD metapool
                   address = '0xf74ebe6e5586275dc4CeD78F5DBEF31B1EfbE7a5' OR -- tBTCv2 metapool
                   address = '0x3F1d224557afA4365155ea77cE4BC32D5Dae2174')             -- WCUSD metapool
              AND topics[SAFE_OFFSET(0)] =
                  '0x6617207207e397b41fc98016d8c9febb7223f44c355db66ad429730f2b950a60' -- "TokenSwapUnderlying" event
              AND block_number <= 13330090 -- 2021-10-01 00:00:00
        );

END;

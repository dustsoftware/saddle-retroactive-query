BEGIN

    CREATE TEMP FUNCTION
        PARSE_SADDLE_LP_TRANSFER_EVENTS(data STRING, topics ARRAY <STRING>)
        RETURNS STRUCT <`from` STRING, `to` STRING, `value` STRING>
        LANGUAGE js AS """
    const parsedEvent = {
        "anonymous": false,
        "inputs": [{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],
        "name": "Transfer",
        "type": "event"
    }
    return abi.decodeEvent(parsedEvent, data, topics, false);
"""
        OPTIONS
            ( library = "https://storage.googleapis.com/ethlab-183014.appspot.com/ethjs-abi.js" );


    CREATE TABLE retroactive_lp
    AS
        (
            SELECT logs.address                                                  as token,
                   logs.block_number                                             as block_number,
                   PARSE_SADDLE_LP_TRANSFER_EVENTS(logs.data, logs.topics).from  as address_from,
                   PARSE_SADDLE_LP_TRANSFER_EVENTS(logs.data, logs.topics).to    as address_to,
                   PARSE_SADDLE_LP_TRANSFER_EVENTS(logs.data, logs.topics).value as amount

            FROM `bigquery-public-data.crypto_ethereum.logs` AS logs
            WHERE (address = '0xc28df698475dec994be00c9c9d8658a548e6304f' OR -- BTC lp token
                   address = '0x76204f8cfe8b95191a3d1cfa59e267ea65e06fac' OR -- USD lp token
                   address = '0xe37e2a01fea778bc1717d72bd9f018b6a6b241d5' OR -- vETH2 lp token
                   address = '0xc9da65931abf0ed1b74ce5ad8c041c4220940368' OR -- alETH lp token
                   address = '0xd48cf4d7fb0824cc8bae055df3092584d0a1726a' OR -- d4 lp token
                   address = '0xd48cf4d7fb0824cc8bae055df3092584d0a1726a' OR -- USD v2 lp token
                   address = '0x8fa31c1b33de16bf05c38af20329f22d544ad64c' OR -- sUSD metapool lp token
                   address = '0xf32e91464ca18fc156ab97a697d6f8ae66cd21a3' OR -- BTC v2 lp token
                   address = '0x122eca07139eb368245a29fb702c9ff11e9693b7' OR -- tBTC metapool lp token
                   address = '0x78179d49c13c4eca14c69545ec172ba0179eae6b')   -- wCUSD metapool lp token
              AND topics[SAFE_OFFSET(0)] =
                  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' -- "Transfer" event
              AND block_number <= 13330090 -- 2021-10-01 00:00:00
        );

END;

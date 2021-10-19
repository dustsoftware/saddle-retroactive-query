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
                   logs.block_timestamp                                          as block_timestamp,
                   PARSE_SADDLE_LP_TRANSFER_EVENTS(logs.data, logs.topics).from  as address_from,
                   PARSE_SADDLE_LP_TRANSFER_EVENTS(logs.data, logs.topics).to    as address_to,
                   PARSE_SADDLE_LP_TRANSFER_EVENTS(logs.data, logs.topics).value as amount
            FROM `bigquery-public-data.crypto_ethereum.logs` AS logs
            WHERE (address = '0xC28DF698475dEC994BE00C9C9D8658A548e6304F' OR -- BTC lp token
                   address = '0x76204f8CFE8B95191A3d1CfA59E267EA65e06FAC' OR -- USD lp token
                   address = '0xe37E2a01feA778BC1717d72Bd9f018B6A6B241D5' OR -- vETH2 lp token
                   address = '0xc9da65931ABf0Ed1b74Ce5ad8c041C4220940368' OR -- alETH lp token
                   address = '0xd48cF4D7FB0824CC8bAe055dF3092584d0a1726A' OR -- d4 lp token
                   address = '0x5f86558387293b6009d7896A61fcc86C17808D62' OR -- USD v2 lp token
                   address = '0x8Fa31c1b33De16bf05c38AF20329f22D544aD64c' OR -- sUSD metapool lp token
                   address = '0xF32E91464ca18fc156aB97a697D6f8ae66Cd21a3' OR -- BTC v2 lp token
                   address = '0x122Eca07139EB368245A29FB702c9ff11E9693B7' OR -- tBTC metapool lp token
                   address = '0x78179d49C13c4ECa14C69545ec172Ba0179EAE6B') -- wCUSD metapool lp token
              AND topics[SAFE_OFFSET(0)] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' -- "Transfer" event
              AND block_number <= 13330090 -- 2021-10-01 00:00:00
        );

END;

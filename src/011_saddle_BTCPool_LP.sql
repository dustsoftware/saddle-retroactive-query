BEGIN

CREATE TEMP FUNCTION
    PARSE_SADDLE_LP_TRANSFER_EVENTS(data STRING, topics ARRAY<STRING>)
    RETURNS STRUCT<`from` STRING, `to` STRING, `value` STRING>
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
  ( library="https://storage.googleapis.com/ethlab-183014.appspot.com/ethjs-abi.js" );


CREATE TABLE btc_lp_transfer
AS
(
    SELECT
        logs.block_number as block_number,
        logs.block_timestamp as block_timestamp,
        logs.transaction_hash as transaction_hash,
        PARSE_SADDLE_LP_TRANSFER_EVENTS(logs.data, logs.topics).from as address_from,
        PARSE_SADDLE_LP_TRANSFER_EVENTS(logs.data, logs.topics).to as address_to,
        PARSE_SADDLE_LP_TRANSFER_EVENTS(logs.data, logs.topics).value as amount
    FROM `bigquery-public-data.crypto_ethereum.logs` AS logs
    WHERE address = '0xc28df698475dec994be00c9c9d8658a548e6304f'
      -- Exclude staking contract
    AND PARSE_SADDLE_LP_TRANSFER_EVENTS(data, topics).from != '0x78aa83bd6c9de5de0a2231366900ab060a482edd'
    AND PARSE_SADDLE_LP_TRANSFER_EVENTS(data, topics).to != '0x78aa83bd6c9de5de0a2231366900ab060a482edd'
    AND topics[SAFE_OFFSET(0)] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
);

END;

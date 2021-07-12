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


CREATE TABLE aleth_lp_transfer
AS
(
    SELECT
        logs.block_timestamp as block_timestamp,
        logs.transaction_hash as transaction_hash,
        PARSE_SADDLE_LP_TRANSFER_EVENTS(logs.data, logs.topics).from as address_from,
        PARSE_SADDLE_LP_TRANSFER_EVENTS(logs.data, logs.topics).to as address_to,
        PARSE_SADDLE_LP_TRANSFER_EVENTS(logs.data, logs.topics).value as amount
    FROM `bigquery-public-data.crypto_ethereum.logs` AS logs
    WHERE address = '0xd48cf4d7fb0824cc8bae055df3092584d0a1726a'
      -- Exclude staking contract
    AND PARSE_SADDLE_LP_TRANSFER_EVENTS(data, topics).from != '0x0639076265e9f88542c91dcdeda65127974a5ca5'
    AND PARSE_SADDLE_LP_TRANSFER_EVENTS(data, topics).to != '0x0639076265e9f88542c91dcdeda65127974a5ca5'
    AND topics[SAFE_OFFSET(0)] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
);

END;

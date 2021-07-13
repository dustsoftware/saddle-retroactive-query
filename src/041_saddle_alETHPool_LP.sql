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
    WHERE address = '0xc9da65931abf0ed1b74ce5ad8c041c4220940368'
      -- Exclude staking contract
    AND PARSE_SADDLE_LP_TRANSFER_EVENTS(data, topics).from != '0xab8e74017a8cc7c15ffccd726603790d26d7deca'
    AND PARSE_SADDLE_LP_TRANSFER_EVENTS(data, topics).to != '0xab8e74017a8cc7c15ffccd726603790d26d7deca'
      -- Exclude pickle like jar, strategy, and controller
    AND PARSE_SADDLE_LP_TRANSFER_EVENTS(data, topics).from != '0xcba1fe4fdbd90531efd929f1a1831f38e91cff1e'
    AND PARSE_SADDLE_LP_TRANSFER_EVENTS(data, topics).to != '0xcba1fe4fdbd90531efd929f1a1831f38e91cff1e'
    AND PARSE_SADDLE_LP_TRANSFER_EVENTS(data, topics).from != '0x7b5916c61bceeaa2646cf49d9541ac6f5dce3637'
    AND PARSE_SADDLE_LP_TRANSFER_EVENTS(data, topics).to != '0x7b5916c61bceeaa2646cf49d9541ac6f5dce3637'
    AND PARSE_SADDLE_LP_TRANSFER_EVENTS(data, topics).from != '0x0185ee1a1101f9c43c6a33a48faa7edb102f1e30'
    AND PARSE_SADDLE_LP_TRANSFER_EVENTS(data, topics).to != '0x0185ee1a1101f9c43c6a33a48faa7edb102f1e30'
    AND topics[SAFE_OFFSET(0)] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
);

END;

BEGIN

CREATE TEMP FUNCTION
    PARSE_SADDLE_SWAP_EVENTS(data STRING, topics ARRAY<STRING>)
    RETURNS STRUCT<`buyer` STRING>
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
  ( library="https://storage.googleapis.com/ethlab-183014.appspot.com/ethjs-abi.js" );


CREATE TABLE aleth_swap
AS
(
    SELECT
    DISTINCT
        PARSE_SADDLE_SWAP_EVENTS(logs.data, logs.topics).buyer as buyer
    FROM `bigquery-public-data.crypto_ethereum.logs` AS logs
    WHERE address = '0xa6018520eaacc06c30ff2e1b3ee2c7c22e64196a'
    AND topics[SAFE_OFFSET(0)] = '0xc6c1e0630dbe9130cc068028486c0d118ddcea348550819defd5cb8c257f8a38'
);

END;

BEGIN

CREATE TABLE retroactive_swap
AS
(
    SELECT buyer, STRING_AGG(pool, ', ') AS pools
    FROM (
        SELECT buyer, 'BTC' AS pool FROM btc_swap
        UNION ALL
        SELECT buyer, 'USD' AS pool FROM usd_swap
        UNION ALL
        SELECT buyer, 'vETH2' AS pool FROM veth2_swap
        UNION ALL
        SELECT buyer, 'alETH' AS pool FROM aleth_swap
        UNION ALL
        SELECT buyer, 'd4' AS pool FROM d4_swap
    )
    GROUP BY buyer
    ORDER BY buyer
);

CREATE TABLE retroactive_lp
AS
    (
        SELECT block_timestamp, transaction_hash, address_from, address_to, amount, pool
        FROM (
                 SELECT *, 'BTC' AS pool FROM btc_lp_transfer
                 UNION ALL
                 SELECT *, 'USD' AS pool FROM usd_lp_transfer
                 UNION ALL
                 SELECT *, 'vETH2' AS pool FROM veth2_lp_transfer
                 UNION ALL
                 SELECT *, 'alETH' AS pool FROM aleth_lp_transfer
                 UNION ALL
                 SELECT *, 'd4' AS pool FROM d4_lp_transfer
             )
        ORDER BY block_timestamp
    );

END;

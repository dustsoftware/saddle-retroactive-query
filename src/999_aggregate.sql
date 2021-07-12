BEGIN

CREATE TABLE retroactive_users
AS
(
    SELECT voter, STRING_AGG(protocol, ', ') AS protocols
    FROM (
        SELECT voter, 'MKR' AS protocol FROM mkr_voters
        UNION ALL
        SELECT voter, 'COMP' AS protocol FROM comp_voters
        UNION ALL
        SELECT voter, 'YFI' AS protocol FROM yfi_voters
        UNION ALL
        SELECT voter, 'CRV' AS protocol FROM crv_voters
    )
    GROUP BY voter
    ORDER BY voter
);

END;

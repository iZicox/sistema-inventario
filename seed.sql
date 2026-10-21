-- Ubicación única del MVP
insert into location ( code ) values
   ( 'WAREHOUSE' );

-- Catálogo de tipos. Los 6 del MVP + los de fase 2/3 listos para usar.
insert into movement_type (
   code,
   description,
   sign
) values
   ( 'ENTRY',
     'Goods entry',
     1 ),
   ( 'EXIT',
     'Goods exit',
     - 1 ),
   ( 'TRANSFER_OUT',
     'Exit by transfer',
     - 1 ),
   ( 'TRANSFER_IN',
     'Entry by transfer',
     1 ),
   ( 'ADJUSTMENT_UP',
     'Positive stock adjustment',
     1 ),
   ( 'ADJUSTMENT_DOWN',
     'Negative stock adjustment',
     - 1 );
-- Wipe existing council seed and reseed with all 361 UK councils
delete from bindicator_items where council_id not in (select id from bindicator_councils);
delete from bindicator_households where council_id not in (select id from bindicator_councils);
delete from bindicator_councils;


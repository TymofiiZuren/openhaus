-- Twenty additional local demo records. Never updates existing property/media IDs.
BEGIN;
CREATE TEMP TABLE expansion_source ON COMMIT DROP AS
SELECT ('d5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid id, city,county,lng,lat,price,beds,pack,n
FROM (VALUES
(1,'Westport','Mayo',-9.52,53.8,46500000,3,'coastal'),
(2,'Sligo','Sligo',-8.47,54.27,39500000,3,'courtyard'),
(3,'Donegal','Donegal',-8.11,54.65,42500000,4,'harbour'),
(4,'Dingle','Kerry',-10.27,52.14,58500000,4,'harbour'),
(5,'Ennis','Clare',-8.98,52.84,38500000,3,'courtyard'),
(6,'Wexford','Wexford',-6.46,52.34,49500000,4,'harbour'),
(7,'Tramore','Waterford',-7.15,52.16,54500000,3,'coastal'),
(8,'Kilkenny','Kilkenny',-7.25,52.65,47500000,3,'courtyard'),
(9,'Carlow','Carlow',-6.93,52.84,34500000,4,'harbour'),
(10,'Naas','Kildare',-6.67,53.22,62500000,3,'courtyard'),
(11,'Navan','Meath',-6.68,53.65,43500000,3,'courtyard'),
(12,'Drogheda','Louth',-6.35,53.72,45500000,4,'harbour'),
(13,'Mullingar','Westmeath',-7.34,53.52,41500000,3,'courtyard'),
(14,'Tullamore','Offaly',-7.49,53.27,36500000,3,'courtyard'),
(15,'Portlaoise','Laois',-7.3,53.03,35500000,3,'courtyard'),
(16,'Cavan','Cavan',-7.36,53.99,32500000,3,'courtyard'),
(17,'Monaghan','Monaghan',-6.97,54.25,33500000,4,'harbour'),
(18,'Roscommon','Roscommon',-8.19,53.63,31500000,3,'courtyard'),
(19,'Carrick-on-Shannon','Leitrim',-8.09,53.95,37500000,4,'harbour'),
(20,'Nenagh','Tipperary',-8.2,52.86,40500000,3,'courtyard')
) v(n,city,county,lng,lat,price,beds,pack);
CREATE TEMP TABLE expansion_inserted (id uuid) ON COMMIT DROP;
WITH added AS (
 INSERT INTO properties(id,title,address_line1,city,county,price_cents,bedrooms,property_type,location,status)
 SELECT id,'Demo listing · '||city||' '||CASE pack WHEN 'harbour' THEN 'townhouse' WHEN 'coastal' THEN 'retreat' ELSE 'courtyard home' END,
 'Fictional concept — shared illustration assets — not for sale',city,county,price,beds,
 CASE pack WHEN 'harbour' THEN 'terraced' ELSE 'detached' END,
 ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography,'published'
 FROM expansion_source ON CONFLICT (id) DO NOTHING RETURNING id
) INSERT INTO expansion_inserted SELECT id FROM added;
INSERT INTO property_media(id,property_id,kind,url,alt_text,position)
SELECT ('d6000000-0000-4000-8000-'||lpad((s.n*10+m.position)::text,12,'0'))::uuid,s.id,m.kind::property_media_kind,
 '/media-demo/'||s.pack||m.suffix,m.description,m.position
FROM expansion_source s JOIN expansion_inserted i USING(id)
CROSS JOIN (VALUES
 (0,'image','-exterior.jpg','Shared AI-generated exterior concept · fictional demonstration, not this location'),
 (1,'image','-interior.jpg','Shared AI-generated interior concept · not a verified property layout'),
 (2,'video','-study.mp4','Shared fictional concept slideshow · not recorded footage')
) m(position,kind,suffix,description);
SELECT count(*) AS new_demo_listings,count(*)*3 AS new_media_items FROM expansion_inserted;
\if :apply
COMMIT;
\else
ROLLBACK;
\endif

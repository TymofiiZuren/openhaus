-- Run only through scripts/seed-showcase.sh. Inserts new fictional packs only.
-- Existing IDs (including edited demo listings) and their media are untouched.
BEGIN;
CREATE TEMP TABLE showcase_inserted (id uuid, pack text) ON COMMIT DROP;
WITH added AS (
 INSERT INTO properties(id,title,address_line1,city,county,price_cents,bedrooms,property_type,location,status)
 VALUES
 ('d3000000-0000-4000-8000-000000000001','Demo listing · Coastal retreat','Fictional concept — not for sale','Dun Laoghaire','Dublin',78500000,3,'detached',ST_SetSRID(ST_MakePoint(-6.13,53.29),4326)::geography,'published'),
 ('d3000000-0000-4000-8000-000000000002','Demo listing · Limestone courtyard','Fictional concept — not for sale','Oranmore','Galway',59500000,3,'detached',ST_SetSRID(ST_MakePoint(-8.92,53.27),4326)::geography,'published'),
 ('d3000000-0000-4000-8000-000000000003','Demo listing · Harbour townhouse','Fictional concept — not for sale','Kinsale','Cork',67500000,4,'terraced',ST_SetSRID(ST_MakePoint(-8.52,51.70),4326)::geography,'published')
 ON CONFLICT (id) DO NOTHING RETURNING id
)
INSERT INTO showcase_inserted SELECT id,CASE right(id::text,1) WHEN '1' THEN 'coastal' WHEN '2' THEN 'courtyard' ELSE 'harbour' END FROM added;
INSERT INTO property_media(id,property_id,kind,url,alt_text,position)
SELECT (left(s.id::text,34)||right(s.id::text,1)||m.position::text)::uuid,s.id,m.kind::property_media_kind,
 '/media-demo/'||s.pack||m.suffix,m.description,m.position
FROM showcase_inserted s CROSS JOIN (VALUES
 (0,'image','-exterior.jpg','AI-generated exterior concept · fictional demonstration'),
 (1,'image','-interior.jpg','AI-generated interior concept · independently imagined, not a verified layout'),
 (2,'video','-study.mp4','Fictional concept slideshow · still-image sequence, not filmed footage')
) m(position,kind,suffix,description);
SELECT count(*) AS new_demo_listings, count(*)*3 AS new_media_items FROM showcase_inserted;
\if :apply
COMMIT;
\else
ROLLBACK;
\endif

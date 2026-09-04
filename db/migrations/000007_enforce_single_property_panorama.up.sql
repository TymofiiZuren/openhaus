WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY property_id
               ORDER BY position DESC, created_at DESC, id DESC
           ) AS rank
    FROM property_media
    WHERE kind = 'panorama'
)
DELETE FROM property_media
USING ranked
WHERE property_media.id = ranked.id
  AND ranked.rank > 1;

CREATE UNIQUE INDEX property_media_one_panorama_per_property_idx
    ON property_media (property_id)
    WHERE kind = 'panorama';

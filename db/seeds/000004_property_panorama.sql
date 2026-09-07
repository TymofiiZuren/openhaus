INSERT INTO property_media (id, property_id, kind, url, alt_text, position)
SELECT
    gen_random_uuid(),
    properties.id,
    'panorama',
    'https://kuula.co/share/LTPpc?logo=1&info=1&fs=1&vr=0&sd=1&thumbs=1',
    'Illustrative 360-degree interior tour for ' || properties.title,
    COALESCE((SELECT MAX(position) + 1 FROM property_media WHERE property_id = properties.id), 0)
FROM properties
WHERE NOT EXISTS (
    SELECT 1 FROM property_media WHERE property_id = properties.id AND kind = 'panorama'
);

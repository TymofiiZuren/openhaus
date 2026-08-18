INSERT INTO properties (
    id,
    title,
    address_line1,
    city,
    county,
    price_cents,
    bedrooms,
    property_type,
    location,
    status
)
VALUES
    (
        '11111111-1111-4111-8111-111111111111',
        'Red-brick home near St Stephen''s Green',
        '14 Leeson Park',
        'Dublin',
        'Dublin',
        89500000,
        4,
        'terraced',
        ST_SetSRID(ST_MakePoint(-6.2527, 53.3320), 4326)::geography,
        'published'
    ),
    (
        '22222222-2222-4222-8222-222222222222',
        'Detached family home overlooking the Lee',
        '8 Sunday''s Well Road',
        'Cork',
        'Cork',
        62500000,
        4,
        'detached',
        ST_SetSRID(ST_MakePoint(-8.4932, 51.9045), 4326)::geography,
        'published'
    ),
    (
        '33333333-3333-4333-8333-333333333333',
        'City apartment beside Galway Bay',
        '21 Long Walk',
        'Galway',
        'Galway',
        38500000,
        2,
        'apartment',
        ST_SetSRID(ST_MakePoint(-9.0542, 53.2691), 4326)::geography,
        'published'
    )
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    address_line1 = EXCLUDED.address_line1,
    city = EXCLUDED.city,
    county = EXCLUDED.county,
    price_cents = EXCLUDED.price_cents,
    bedrooms = EXCLUDED.bedrooms,
    property_type = EXCLUDED.property_type,
    location = EXCLUDED.location,
    status = EXCLUDED.status,
    updated_at = now();

UPDATE properties
SET
    title = 'Garden-view contemporary residence',
    address_line1 = 'Douglas, Cork',
    city = 'Cork',
    county = 'Cork',
    price_cents = 72500000,
    bedrooms = 4,
    property_type = 'detached',
    status = 'published',
    updated_at = now()
WHERE id = '22222222-2222-4222-8222-222222222222';

DELETE FROM property_media
WHERE property_id = '22222222-2222-4222-8222-222222222222';

INSERT INTO property_media (id, property_id, kind, url, alt_text, position)
VALUES
    ('b0000000-0000-4000-8000-000000000019', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/exterior.webp', 'Exterior of the Cork property', 0),
    ('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/living-room-entry.webp', 'Contemporary living room viewed from the entrance', 1),
    ('b0000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/living-room-garden.webp', 'Living room opening onto the garden', 2),
    ('b0000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/living-room-front.webp', 'Front view of the living room seating', 3),
    ('b0000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/living-room-glass.webp', 'Living room seen through glazed doors', 4),
    ('b0000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/living-room-wide.webp', 'Wide living room with garden windows', 5),
    ('b0000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/living-room-sofas.webp', 'Living room sofas beside full-height windows', 6),
    ('b0000000-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/dining-area.webp', 'Dining area adjoining the living room', 7),
    ('b0000000-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/gallery-corridor.webp', 'Glazed corridor overlooking mature trees', 8),
    ('b0000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/bedroom-dark.webp', 'Bedroom with a garden-facing window', 9),
    ('b0000000-0000-4000-8000-000000000010', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/bedroom-window.webp', 'Bedroom with built-in storage and window seat', 10),
    ('b0000000-0000-4000-8000-000000000011', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/bedroom-study.webp', 'Bedroom with an integrated study desk', 11),
    ('b0000000-0000-4000-8000-000000000012', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/office.webp', 'Home office overlooking the garden', 12),
    ('b0000000-0000-4000-8000-000000000013', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/kitchen.webp', 'Fitted kitchen with garden-facing window', 13),
    ('b0000000-0000-4000-8000-000000000014', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/bathroom.webp', 'Bathroom with marble vanity', 14),
    ('b0000000-0000-4000-8000-000000000015', '22222222-2222-4222-8222-222222222222', 'image', '/media/properties/douglas-cork/window-detail.webp', 'Garden view through bedroom blinds', 15),
    ('b0000000-0000-4000-8000-000000000016', '22222222-2222-4222-8222-222222222222', 'floor_plan', '/media/properties/douglas-cork/floor-plan.webp', 'Measured floor plan of the Cork property', 16),
    ('b0000000-0000-4000-8000-000000000017', '22222222-2222-4222-8222-222222222222', 'floor_plan', '/media/properties/douglas-cork/furnished-plan.webp', 'Furnished floor plan of the Cork property', 17),
    ('b0000000-0000-4000-8000-000000000018', '22222222-2222-4222-8222-222222222222', 'video', '/media/properties/douglas-cork/tour.mp4', 'Video tour of the Cork property', 18);

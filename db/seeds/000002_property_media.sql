-- Keep the current proof of concept focused on one public property.
UPDATE properties
SET
    title = 'Contemporary detached family home',
    address_line1 = 'Dublin 4',
    property_type = 'detached',
    updated_at = now()
WHERE id = '11111111-1111-4111-8111-111111111111';

UPDATE properties
SET status = 'draft', updated_at = now()
WHERE id IN (
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333'
);

DELETE FROM property_media
WHERE property_id = '11111111-1111-4111-8111-111111111111';

INSERT INTO property_media (
    id,
    property_id,
    kind,
    url,
    alt_text,
    position
)
VALUES
    ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/exterior-front.webp', 'Front exterior of the detached home', 0),
    ('a0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/exterior-angle.webp', 'Angled exterior view of the detached home', 1),
    ('a0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/living-room-window.webp', 'Bright living room overlooking the garden', 2),
    ('a0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/living-room-wide.webp', 'Wide view of the open-plan living room', 3),
    ('a0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/living-room-detail.webp', 'Living room with marble feature counter', 4),
    ('a0000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/living-room-tv.webp', 'Living room media wall', 5),
    ('a0000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/living-room-seating.webp', 'Living room seating and study area', 6),
    ('a0000000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/open-plan-living.webp', 'Open-plan living and dining space', 7),
    ('a0000000-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/kitchen.webp', 'Kitchen with garden-facing window', 8),
    ('a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/main-bedroom.webp', 'Main bedroom with built-in headboard', 9),
    ('a0000000-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/bathroom.webp', 'Bathroom with double vanity', 10),
    ('a0000000-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/washroom.webp', 'Washroom with patterned tile details', 11),
    ('a0000000-0000-4000-8000-000000000013', '11111111-1111-4111-8111-111111111111', 'image', '/media/properties/leeson-park/childrens-room.webp', 'Children''s bedroom with built-in play area', 12),
    ('a0000000-0000-4000-8000-000000000014', '11111111-1111-4111-8111-111111111111', 'floor_plan', '/media/properties/leeson-park/floor-plan.webp', 'Measured floor plan of the property', 13),
    ('a0000000-0000-4000-8000-000000000015', '11111111-1111-4111-8111-111111111111', 'floor_plan', '/media/properties/leeson-park/furnished-plan.webp', 'Furnished floor plan of the property', 14),
    ('a0000000-0000-4000-8000-000000000016', '11111111-1111-4111-8111-111111111111', 'video', '/media/properties/leeson-park/tour.mp4', 'Video tour of the Dublin property', 15);

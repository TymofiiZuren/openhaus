CREATE TYPE property_media_kind AS ENUM (
    'image',
    'floor_plan',
    'panorama',
    'video'
);

CREATE TABLE property_media (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL
        REFERENCES properties(id)
        ON DELETE CASCADE,

    kind property_media_kind NOT NULL,
    url TEXT NOT NULL,
    alt_text TEXT NOT NULL,
    position SMALLINT NOT NULL CHECK (position >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (property_id, position)
);

CREATE INDEX property_media_property_position_idx
    ON property_media (property_id, position);

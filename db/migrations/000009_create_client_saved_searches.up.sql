CREATE TABLE client_saved_searches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_user_id uuid NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
    location text NOT NULL CHECK (char_length(location) BETWEEN 1 AND 160),
    county text CHECK (county IS NULL OR char_length(county) BETWEEN 1 AND 80),
    area text CHECK (area IS NULL OR char_length(area) BETWEEN 1 AND 120),
    query text NOT NULL DEFAULT '' CHECK (char_length(query) <= 160),
    minimum_bedrooms smallint NOT NULL DEFAULT 0 CHECK (minimum_bedrooms BETWEEN 0 AND 20),
    property_type text NOT NULL DEFAULT 'all' CHECK (property_type IN ('all', 'detached', 'semi_detached', 'terraced', 'apartment')),
    maximum_price_cents bigint NOT NULL DEFAULT 0 CHECK (maximum_price_cents BETWEEN 0 AND 100000000000),
    spatial_only boolean NOT NULL DEFAULT false,
    frequency text NOT NULL CHECK (frequency IN ('instant', 'daily', 'weekly')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_saved_searches_owner_created_idx ON client_saved_searches(client_user_id, created_at DESC);

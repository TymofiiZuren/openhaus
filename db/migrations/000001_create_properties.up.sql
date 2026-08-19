CREATE TABLE properties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    address_line1 text NOT NULL CHECK (char_length(address_line1) BETWEEN 1 AND 200),
    city text NOT NULL CHECK (char_length(city) BETWEEN 1 AND 100),
    county text NOT NULL CHECK (char_length(county) BETWEEN 1 AND 100),
    price_cents bigint NOT NULL CHECK (price_cents > 0),
    bedrooms smallint NOT NULL CHECK (bedrooms BETWEEN 0 AND 20),
    property_type text NOT NULL CHECK (
        property_type IN ('detached', 'semi_detached', 'terraced', 'apartment')
    ),
    location geography(Point, 4326) NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'published', 'archived')
    ),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX properties_county_city_idx ON properties (county, city);
CREATE INDEX properties_price_cents_idx ON properties (price_cents);
CREATE INDEX properties_location_idx ON properties USING gist (location);
CREATE INDEX properties_published_idx
    ON properties (created_at DESC)
    WHERE status = 'published';

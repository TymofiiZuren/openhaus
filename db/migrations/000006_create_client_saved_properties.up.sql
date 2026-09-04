CREATE TABLE client_saved_properties (
    client_user_id uuid NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_user_id, property_id)
);

CREATE INDEX client_saved_properties_property_idx ON client_saved_properties(property_id);

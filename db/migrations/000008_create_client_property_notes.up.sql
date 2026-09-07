CREATE TABLE client_property_notes (
    client_user_id uuid NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 4000),
    questions text[] NOT NULL DEFAULT '{}' CHECK (cardinality(questions) <= 8),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_user_id, property_id)
);

CREATE INDEX client_property_notes_property_idx ON client_property_notes(property_id);

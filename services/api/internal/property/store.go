package property

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
)

type queryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

// Store reads property catalogue data from PostgreSQL.
type Store struct {
	database queryer
}

// NewStore creates a property store backed by a pool or transaction.
func NewStore(database queryer) *Store {
	return &Store{database: database}
}

// ListPublished returns the newest published homes.
func (store *Store) ListPublished(ctx context.Context, bounds *Bounds) ([]Property, error) {
	query := `
		SELECT
			id::text,
			title,
			address_line1,
			city,
			county,
			price_cents,
			bedrooms,
			property_type,
			ST_X(location::geometry),
			ST_Y(location::geometry),
			COALESCE((
				SELECT jsonb_agg(
					jsonb_build_object(
						'url', media.url,
						'kind', media.kind,
						'altText', media.alt_text,
						'position', media.position
					)
					ORDER BY media.position
				)
				FROM property_media AS media
				WHERE media.property_id = properties.id
			), '[]'::jsonb)
		FROM properties
		WHERE status = 'published'
	`
	var arguments []any
	if bounds != nil {
		query += `
			AND location && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
			AND ST_Intersects(location, ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography)
		`
		arguments = []any{bounds.West, bounds.South, bounds.East, bounds.North}
	}
	query += ` ORDER BY created_at DESC, id DESC`

	rows, err := store.database.Query(ctx, query, arguments...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	properties := make([]Property, 0)
	for rows.Next() {
		var item Property
		var mediaJSON []byte
		if err := rows.Scan(
			&item.ID,
			&item.Title,
			&item.AddressLine1,
			&item.City,
			&item.County,
			&item.PriceCents,
			&item.Bedrooms,
			&item.PropertyType,
			&item.Longitude,
			&item.Latitude,
			&mediaJSON,
		); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(mediaJSON, &item.Media); err != nil {
			return nil, err
		}
		properties = append(properties, item)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return properties, nil
}

// ListManaged returns every listing, including drafts and archived homes.
func (store *Store) ListManaged(ctx context.Context) ([]ManagedProperty, error) {
	rows, err := store.database.Query(ctx, `
		SELECT id::text, title, address_line1, city, county, price_cents, bedrooms,
		       property_type, ST_X(location::geometry), ST_Y(location::geometry), status
		FROM properties
		ORDER BY updated_at DESC, id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]ManagedProperty, 0)
	for rows.Next() {
		var item ManagedProperty
		item.Media = []Media{}
		if err := rows.Scan(&item.ID, &item.Title, &item.AddressLine1, &item.City, &item.County,
			&item.PriceCents, &item.Bedrooms, &item.PropertyType, &item.Longitude, &item.Latitude, &item.Status); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

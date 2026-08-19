package property

import (
	"context"

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
func (store *Store) ListPublished(ctx context.Context) ([]Property, error) {
	rows, err := store.database.Query(ctx, `
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
			ST_Y(location::geometry)
		FROM properties
		WHERE status = 'published'
		ORDER BY created_at DESC, id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	properties := make([]Property, 0)
	for rows.Next() {
		var item Property
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
		); err != nil {
			return nil, err
		}
		properties = append(properties, item)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return properties, nil
}

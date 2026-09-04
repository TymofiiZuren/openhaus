package property

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

type queryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

var ErrNotFound = errors.New("property not found")

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
		       property_type, ST_X(location::geometry), ST_Y(location::geometry), status,
		       COALESCE((SELECT jsonb_agg(jsonb_build_object('url', media.url, 'kind', media.kind, 'altText', media.alt_text, 'position', media.position) ORDER BY media.position) FROM property_media AS media WHERE media.property_id = properties.id), '[]'::jsonb)
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
		var mediaJSON []byte
		if err := rows.Scan(&item.ID, &item.Title, &item.AddressLine1, &item.City, &item.County,
			&item.PriceCents, &item.Bedrooms, &item.PropertyType, &item.Longitude, &item.Latitude, &item.Status, &mediaJSON); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(mediaJSON, &item.Media); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (store *Store) UpsertPanorama(ctx context.Context, propertyID, shareURL, altText string) (Media, error) {
	id, err := randomUUID()
	if err != nil {
		return Media{}, err
	}
	var media Media
	err = store.database.QueryRow(ctx, `
		WITH target AS (SELECT id FROM properties WHERE id = $1::uuid),
		removed AS (DELETE FROM property_media WHERE property_id IN (SELECT id FROM target) AND kind = 'panorama'),
		next_position AS (SELECT COALESCE(MAX(position), -1) + 1 AS position FROM property_media WHERE property_id IN (SELECT id FROM target)),
		inserted AS (
			INSERT INTO property_media (id, property_id, kind, url, alt_text, position)
			SELECT $2::uuid, target.id, 'panorama', $3, $4, next_position.position FROM target CROSS JOIN next_position
			RETURNING url, kind::text, alt_text, position
		)
		SELECT url, kind, alt_text, position FROM inserted
	`, propertyID, id, shareURL, altText).Scan(&media.URL, &media.Kind, &media.AltText, &media.Position)
	if errors.Is(err, pgx.ErrNoRows) {
		return Media{}, ErrNotFound
	}
	return media, err
}

func (store *Store) RemovePanorama(ctx context.Context, propertyID string) error {
	var propertyExists bool
	err := store.database.QueryRow(ctx, `
		WITH target AS (SELECT id FROM properties WHERE id = $1::uuid),
		removed AS (
			DELETE FROM property_media
			WHERE property_id IN (SELECT id FROM target) AND kind = 'panorama'
			RETURNING 1
		)
		SELECT EXISTS(SELECT 1 FROM target)
	`, propertyID).Scan(&propertyExists)
	if err != nil {
		return err
	}
	if !propertyExists {
		return ErrNotFound
	}
	return nil
}

func randomUUID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	value[6] = value[6]&0x0f | 0x40
	value[8] = value[8]&0x3f | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", value[0:4], value[4:6], value[6:8], value[8:10], value[10:16]), nil
}

func (store *Store) CreateManaged(ctx context.Context, input ManagedPropertyInput) (ManagedProperty, error) {
	input.Status = "draft"
	return store.scanManaged(store.database.QueryRow(ctx, `
		INSERT INTO properties (title, address_line1, city, county, price_cents, bedrooms, property_type, location, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography, 'draft')
		RETURNING id::text, title, address_line1, city, county, price_cents, bedrooms,
		          property_type, ST_X(location::geometry), ST_Y(location::geometry), status
	`, input.Title, input.AddressLine1, input.City, input.County, input.PriceCents, input.Bedrooms,
		input.PropertyType, input.Longitude, input.Latitude))
}

func (store *Store) UpdateManaged(ctx context.Context, id string, input ManagedPropertyInput) (ManagedProperty, error) {
	item, err := store.scanManaged(store.database.QueryRow(ctx, `
		UPDATE properties
		SET title = $2, address_line1 = $3, city = $4, county = $5, price_cents = $6,
		    bedrooms = $7, property_type = $8,
		    location = ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography,
		    status = $11, updated_at = now()
		WHERE id = $1::uuid
		RETURNING id::text, title, address_line1, city, county, price_cents, bedrooms,
		          property_type, ST_X(location::geometry), ST_Y(location::geometry), status
	`, id, input.Title, input.AddressLine1, input.City, input.County, input.PriceCents, input.Bedrooms,
		input.PropertyType, input.Longitude, input.Latitude, input.Status))
	if errors.Is(err, pgx.ErrNoRows) {
		return ManagedProperty{}, ErrNotFound
	}
	return item, err
}

func (store *Store) scanManaged(row pgx.Row) (ManagedProperty, error) {
	var item ManagedProperty
	item.Media = []Media{}
	err := row.Scan(&item.ID, &item.Title, &item.AddressLine1, &item.City, &item.County,
		&item.PriceCents, &item.Bedrooms, &item.PropertyType, &item.Longitude, &item.Latitude, &item.Status)
	return item, err
}

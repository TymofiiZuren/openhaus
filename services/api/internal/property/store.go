package property

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type queryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
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

// ListClientSaved returns published homes saved by one authenticated buyer.
func (store *Store) ListClientSaved(ctx context.Context, clientID string) ([]Property, error) {
	rows, err := store.database.Query(ctx, `
		SELECT p.id::text, p.title, p.address_line1, p.city, p.county, p.price_cents,
		       p.bedrooms, p.property_type, ST_X(p.location::geometry), ST_Y(p.location::geometry),
		       COALESCE((
		         SELECT jsonb_agg(jsonb_build_object('url', m.url, 'kind', m.kind, 'altText', m.alt_text, 'position', m.position) ORDER BY m.position)
		         FROM property_media m WHERE m.property_id = p.id
		       ), '[]'::jsonb)
		FROM client_saved_properties saved
		JOIN properties p ON p.id = saved.property_id
		WHERE saved.client_user_id = $1::uuid AND p.status = 'published'
		ORDER BY saved.created_at DESC, p.id DESC
	`, clientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Property, 0)
	for rows.Next() {
		var item Property
		var mediaJSON []byte
		if err := rows.Scan(&item.ID, &item.Title, &item.AddressLine1, &item.City, &item.County,
			&item.PriceCents, &item.Bedrooms, &item.PropertyType, &item.Longitude, &item.Latitude, &mediaJSON); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(mediaJSON, &item.Media); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// SaveClientProperty idempotently saves a published home for one buyer.
func (store *Store) SaveClientProperty(ctx context.Context, clientID, propertyID string) error {
	result, err := store.database.Exec(ctx, `
		INSERT INTO client_saved_properties(client_user_id, property_id)
		SELECT $1::uuid, id FROM properties WHERE id = $2::uuid AND status = 'published'
		ON CONFLICT(client_user_id, property_id) DO NOTHING
	`, clientID, propertyID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		var exists bool
		if err := store.database.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM client_saved_properties WHERE client_user_id=$1::uuid AND property_id=$2::uuid)`, clientID, propertyID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return ErrNotFound
		}
	}
	return nil
}

// RemoveClientSavedProperty removes only the authenticated buyer's relationship.
func (store *Store) RemoveClientSavedProperty(ctx context.Context, clientID, propertyID string) error {
	_, err := store.database.Exec(ctx, `DELETE FROM client_saved_properties WHERE client_user_id=$1::uuid AND property_id=$2::uuid`, clientID, propertyID)
	return err
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
	tx, err := store.database.(interface {
		Begin(context.Context) (pgx.Tx, error)
	}).Begin(ctx)
	if err != nil {
		return Media{}, err
	}
	defer tx.Rollback(ctx)
	var lockedID string
	if err = tx.QueryRow(ctx, `SELECT id::text FROM properties WHERE id = $1::uuid FOR UPDATE`, propertyID).Scan(&lockedID); errors.Is(err, pgx.ErrNoRows) {
		return Media{}, ErrNotFound
	} else if err != nil {
		return Media{}, err
	}
	id, err := randomUUID()
	if err != nil {
		return Media{}, err
	}
	var media Media
	if _, err = tx.Exec(ctx, `DELETE FROM property_media WHERE property_id = $1::uuid AND kind = 'panorama'`, propertyID); err != nil {
		return Media{}, err
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO property_media (id, property_id, kind, url, alt_text, position)
		VALUES ($2::uuid, $1::uuid, 'panorama', $3, $4,
			(SELECT COALESCE(MAX(position), -1) + 1 FROM property_media WHERE property_id = $1::uuid))
		RETURNING url, kind::text, alt_text, position
	`, propertyID, id, shareURL, altText).Scan(&media.URL, &media.Kind, &media.AltText, &media.Position)
	if err != nil {
		return Media{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Media{}, err
	}
	return media, nil
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
	item, err := store.scanManagedWithMedia(store.database.QueryRow(ctx, `
		WITH updated AS (UPDATE properties
		SET title = $2, address_line1 = $3, city = $4, county = $5, price_cents = $6,
		    bedrooms = $7, property_type = $8,
		    location = ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography,
		    status = $11, updated_at = now()
		WHERE id = $1::uuid
		RETURNING id, title, address_line1, city, county, price_cents, bedrooms,
		          property_type, ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude, status
		)
		SELECT updated.id::text, updated.title, updated.address_line1, updated.city, updated.county,
		       updated.price_cents, updated.bedrooms, updated.property_type, updated.longitude,
		       updated.latitude, updated.status,
		       COALESCE((SELECT jsonb_agg(jsonb_build_object('url', media.url, 'kind', media.kind, 'altText', media.alt_text, 'position', media.position) ORDER BY media.position) FROM property_media AS media WHERE media.property_id = updated.id), '[]'::jsonb)
		FROM updated
	`, id, input.Title, input.AddressLine1, input.City, input.County, input.PriceCents, input.Bedrooms,
		input.PropertyType, input.Longitude, input.Latitude, input.Status))
	if errors.Is(err, pgx.ErrNoRows) {
		return ManagedProperty{}, ErrNotFound
	}
	return item, err
}

func (store *Store) scanManagedWithMedia(row pgx.Row) (ManagedProperty, error) {
	var item ManagedProperty
	var mediaJSON []byte
	err := row.Scan(&item.ID, &item.Title, &item.AddressLine1, &item.City, &item.County,
		&item.PriceCents, &item.Bedrooms, &item.PropertyType, &item.Longitude, &item.Latitude, &item.Status, &mediaJSON)
	if err != nil {
		return ManagedProperty{}, err
	}
	if err = json.Unmarshal(mediaJSON, &item.Media); err != nil {
		return ManagedProperty{}, err
	}
	return item, nil
}

func (store *Store) scanManaged(row pgx.Row) (ManagedProperty, error) {
	var item ManagedProperty
	item.Media = []Media{}
	err := row.Scan(&item.ID, &item.Title, &item.AddressLine1, &item.City, &item.County,
		&item.PriceCents, &item.Bedrooms, &item.PropertyType, &item.Longitude, &item.Latitude, &item.Status)
	return item, err
}

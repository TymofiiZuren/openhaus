package property_test

import (
	"context"
	"os"
	"testing"

	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestStoreListsOnlyPublishedProperties(t *testing.T) {
	ctx := context.Background()
	transaction := newTestTransaction(t)

	const draftID = "44444444-4444-4444-8444-444444444444"
	_, err := transaction.Exec(ctx, `
		INSERT INTO properties (
			id, title, address_line1, city, county, price_cents,
			bedrooms, property_type, location, status
		)
		VALUES (
			$1, 'Draft home', '1 Test Street', 'Dublin', 'Dublin', 10000000,
			1, 'apartment', ST_SetSRID(ST_MakePoint(-6.26, 53.35), 4326)::geography,
			'draft'
		)
	`, draftID)
	if err != nil {
		t.Fatalf("insert draft property: %v", err)
	}

	properties, err := property.NewStore(transaction).ListPublished(ctx, nil)
	if err != nil {
		t.Fatalf("list published properties: %v", err)
	}
	if len(properties) < 1 {
		t.Fatalf("published property count = %d, want at least 1 seeded property", len(properties))
	}

	for _, item := range properties {
		if item.ID == draftID {
			t.Fatal("draft property appeared in public catalogue")
		}
		if item.ID == "" || item.Title == "" || item.PriceCents <= 0 {
			t.Fatalf("incomplete property returned: %#v", item)
		}
	}
}

func TestStoreListsPropertyMediaInPositionOrder(t *testing.T) {
	ctx := context.Background()
	transaction := newTestTransaction(t)

	const propertyID = "11111111-1111-4111-8111-111111111111"
	if _, err := transaction.Exec(ctx, `DELETE FROM property_media WHERE property_id = $1`, propertyID); err != nil {
		t.Fatalf("clear property media: %v", err)
	}

	_, err := transaction.Exec(ctx, `
		INSERT INTO property_media (id, property_id, kind, url, alt_text, position)
		VALUES
			('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', $1, 'floor_plan', '/media/floor-plan.svg', 'Floor plan', 2),
			('dddddddd-dddd-4ddd-8ddd-ddddddddddd0', $1, 'image', '/media/exterior.svg', 'Front of the home', 0)
	`, propertyID)
	if err != nil {
		t.Fatalf("insert property media: %v", err)
	}

	properties, err := property.NewStore(transaction).ListPublished(ctx, nil)
	if err != nil {
		t.Fatalf("list published properties: %v", err)
	}

	for _, item := range properties {
		if item.ID != propertyID {
			continue
		}
		if len(item.Media) != 2 {
			t.Fatalf("media count = %d, want 2", len(item.Media))
		}
		if item.Media[0].Position != 0 || item.Media[1].Position != 2 {
			t.Fatalf("media positions = %d, %d; want 0, 2", item.Media[0].Position, item.Media[1].Position)
		}
		return
	}

	t.Fatalf("property %s was not returned", propertyID)
}

func TestStoreListsPublishedPropertiesInsideBounds(t *testing.T) {
	ctx := context.Background()
	transaction := newTestTransaction(t)

	properties, err := property.NewStore(transaction).ListPublished(ctx, &property.Bounds{
		West: -8.6, South: 51.8, East: -8.3, North: 52.0,
	})
	if err != nil {
		t.Fatalf("list bounded properties: %v", err)
	}
	if len(properties) == 0 {
		t.Fatal("bounded property count = 0, want the seeded Cork property")
	}
	for _, item := range properties {
		if item.Longitude < -8.6 || item.Longitude > -8.3 || item.Latitude < 51.8 || item.Latitude > 52.0 {
			t.Fatalf("property outside requested bounds: %#v", item)
		}
	}
}

func TestPropertiesRejectNonPositivePrice(t *testing.T) {
	ctx := context.Background()
	transaction := newTestTransaction(t)

	_, err := transaction.Exec(ctx, `
		INSERT INTO properties (
			title, address_line1, city, county, price_cents,
			bedrooms, property_type, location, status
		)
		VALUES (
			'Invalid price', '1 Test Street', 'Dublin', 'Dublin', 0,
			1, 'apartment', ST_SetSRID(ST_MakePoint(-6.26, 53.35), 4326)::geography,
			'draft'
		)
	`)
	if err == nil {
		t.Fatal("insert with zero price succeeded, want constraint violation")
	}
}

func newTestTransaction(t *testing.T) pgx.Tx {
	t.Helper()

	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("create database pool: %v", err)
	}
	t.Cleanup(pool.Close)

	transaction, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin transaction: %v", err)
	}
	t.Cleanup(func() {
		if err := transaction.Rollback(ctx); err != nil && err != pgx.ErrTxClosed {
			t.Errorf("roll back transaction: %v", err)
		}
	})
	return transaction
}

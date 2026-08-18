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

	properties, err := property.NewStore(transaction).ListPublished(ctx)
	if err != nil {
		t.Fatalf("list published properties: %v", err)
	}
	if len(properties) < 3 {
		t.Fatalf("published property count = %d, want at least 3 seeded properties", len(properties))
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

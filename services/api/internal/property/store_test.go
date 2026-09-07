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

func TestClientSavedPropertiesAreOwnedByOneBuyer(t *testing.T) {
	ctx := context.Background()
	transaction := newTestTransaction(t)
	const buyerOne = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
	const buyerTwo = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"
	if _, err := transaction.Exec(ctx, `INSERT INTO client_users(id,email,password_hash) VALUES($1,'saved-one@example.test','hash'),($2,'saved-two@example.test','hash')`, buyerOne, buyerTwo); err != nil {
		t.Fatalf("insert buyers: %v", err)
	}
	var propertyID string
	if err := transaction.QueryRow(ctx, `SELECT id::text FROM properties WHERE status='published' ORDER BY id LIMIT 1`).Scan(&propertyID); err != nil {
		t.Fatalf("find published property: %v", err)
	}
	store := property.NewStore(transaction)
	if err := store.SaveClientProperty(ctx, buyerOne, propertyID); err != nil {
		t.Fatalf("save property: %v", err)
	}
	one, err := store.ListClientSaved(ctx, buyerOne)
	if err != nil {
		t.Fatalf("list first buyer: %v", err)
	}
	two, err := store.ListClientSaved(ctx, buyerTwo)
	if err != nil {
		t.Fatalf("list second buyer: %v", err)
	}
	if len(one) != 1 || one[0].ID != propertyID {
		t.Fatalf("first buyer saved properties = %#v", one)
	}
	if len(two) != 0 {
		t.Fatalf("second buyer can see first buyer saved properties: %#v", two)
	}
	if err := store.RemoveClientSavedProperty(ctx, buyerTwo, propertyID); err != nil {
		t.Fatalf("second buyer remove: %v", err)
	}
	one, err = store.ListClientSaved(ctx, buyerOne)
	if err != nil || len(one) != 1 {
		t.Fatalf("other buyer removed saved property: items=%#v err=%v", one, err)
	}
}

func TestClientPropertyNotesAreOwnedByOneBuyer(t *testing.T) {
	ctx := context.Background()
	transaction := newTestTransaction(t)
	const buyerOne = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"
	const buyerTwo = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"
	if _, err := transaction.Exec(ctx, `INSERT INTO client_users(id,email,password_hash) VALUES($1,'notes-one@example.test','hash'),($2,'notes-two@example.test','hash')`, buyerOne, buyerTwo); err != nil {
		t.Fatalf("insert buyers: %v", err)
	}
	var propertyID string
	if err := transaction.QueryRow(ctx, `SELECT id::text FROM properties WHERE status='published' ORDER BY id LIMIT 1`).Scan(&propertyID); err != nil {
		t.Fatalf("find published property: %v", err)
	}
	store := property.NewStore(transaction)
	written, err := store.UpsertClientPropertyNote(ctx, buyerOne, propertyID, property.ClientPropertyNote{Notes: "Check the afternoon light", Questions: []string{"Confirm fixtures"}})
	if err != nil || written.PropertyID != propertyID {
		t.Fatalf("save note: note=%#v err=%v", written, err)
	}
	one, err := store.GetClientPropertyNote(ctx, buyerOne, propertyID)
	if err != nil || one.Notes != "Check the afternoon light" || len(one.Questions) != 1 {
		t.Fatalf("first buyer note=%#v err=%v", one, err)
	}
	two, err := store.GetClientPropertyNote(ctx, buyerTwo, propertyID)
	if err != nil || two.Notes != "" || len(two.Questions) != 0 {
		t.Fatalf("second buyer can see first buyer note=%#v err=%v", two, err)
	}
}

func TestClientSavedSearchesAreOwnedByOneBuyer(t *testing.T) {
	ctx := context.Background()
	transaction := newTestTransaction(t)
	const buyerOne = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1"
	const buyerTwo = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2"
	if _, err := transaction.Exec(ctx, `INSERT INTO client_users(id,email,password_hash) VALUES($1,'search-one@example.test','hash'),($2,'search-two@example.test','hash')`, buyerOne, buyerTwo); err != nil {
		t.Fatalf("insert buyers: %v", err)
	}
	store := property.NewStore(transaction)
	created, err := store.CreateClientSavedSearch(ctx, buyerOne, property.ClientSavedSearch{Location: "Cork", County: "Cork", MinimumBedrooms: 3, PropertyType: "detached", MaximumPrice: 80000000, Frequency: "daily"})
	if err != nil || created.ID == "" {
		t.Fatalf("create saved search: item=%#v err=%v", created, err)
	}
	one, err := store.ListClientSavedSearches(ctx, buyerOne)
	if err != nil || len(one) != 1 || one[0].ID != created.ID {
		t.Fatalf("first buyer searches=%#v err=%v", one, err)
	}
	two, err := store.ListClientSavedSearches(ctx, buyerTwo)
	if err != nil || len(two) != 0 {
		t.Fatalf("second buyer can see first buyer search=%#v err=%v", two, err)
	}
	if err := store.RemoveClientSavedSearch(ctx, buyerTwo, created.ID); err != nil {
		t.Fatalf("second buyer remove: %v", err)
	}
	one, err = store.ListClientSavedSearches(ctx, buyerOne)
	if err != nil || len(one) != 1 {
		t.Fatalf("other buyer removed saved search: items=%#v err=%v", one, err)
	}
	if err := store.RemoveClientSavedSearch(ctx, buyerOne, created.ID); err != nil {
		t.Fatalf("owner remove: %v", err)
	}
	one, err = store.ListClientSavedSearches(ctx, buyerOne)
	if err != nil || len(one) != 0 {
		t.Fatalf("owner search remained: items=%#v err=%v", one, err)
	}
}

func TestClientDataExportContainsOnlyTheAuthenticatedBuyersRecords(t *testing.T) {
	ctx := context.Background()
	transaction := newTestTransaction(t)
	const buyerOne = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1"
	const buyerTwo = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2"
	if _, err := transaction.Exec(ctx, `INSERT INTO client_users(id,email,password_hash) VALUES($1,'export-one@example.test','hash'),($2,'export-two@example.test','hash')`, buyerOne, buyerTwo); err != nil {
		t.Fatalf("insert buyers: %v", err)
	}
	var propertyID string
	if err := transaction.QueryRow(ctx, `SELECT id::text FROM properties WHERE status='published' ORDER BY id LIMIT 1`).Scan(&propertyID); err != nil {
		t.Fatalf("find published property: %v", err)
	}
	store := property.NewStore(transaction)
	if err := store.SaveClientProperty(ctx, buyerOne, propertyID); err != nil {
		t.Fatalf("save property: %v", err)
	}
	if _, err := store.UpsertClientPropertyNote(ctx, buyerOne, propertyID, property.ClientPropertyNote{Notes: "Private export note", Questions: []string{"Confirm fixtures"}}); err != nil {
		t.Fatalf("save note: %v", err)
	}
	if _, err := store.CreateClientSavedSearch(ctx, buyerOne, property.ClientSavedSearch{Location: "Cork", PropertyType: "all", Frequency: "weekly"}); err != nil {
		t.Fatalf("save search: %v", err)
	}

	one, err := store.ExportClientData(ctx, buyerOne)
	if err != nil || len(one.SavedPropertyIDs) != 1 || len(one.SavedSearches) != 1 || len(one.PropertyNotes) != 1 || one.PropertyNotes[0].Notes != "Private export note" {
		t.Fatalf("first buyer export=%#v err=%v", one, err)
	}
	two, err := store.ExportClientData(ctx, buyerTwo)
	if err != nil || len(two.SavedPropertyIDs) != 0 || len(two.SavedSearches) != 0 || len(two.PropertyNotes) != 0 {
		t.Fatalf("second buyer received foreign data=%#v err=%v", two, err)
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

func TestManagerCreatesDraftThenPublishesProperty(t *testing.T) {
	ctx := context.Background()
	transaction := newTestTransaction(t)
	store := property.NewStore(transaction)
	input := property.ManagedPropertyInput{Title: "Harbour home", AddressLine1: "1 Pier Road", City: "Kinsale", County: "Cork", PriceCents: 72500000, Bedrooms: 3, PropertyType: "terraced", Longitude: -8.53, Latitude: 51.7, Status: "published"}

	created, err := store.CreateManaged(ctx, input)
	if err != nil {
		t.Fatalf("create managed property: %v", err)
	}
	if created.Status != "draft" {
		t.Fatalf("created status = %q, want draft", created.Status)
	}
	media, err := store.AddImage(ctx, created.ID, "image", "/api/v1/property-images/cover.png", "Front elevation")
	if err != nil {
		t.Fatalf("add managed property media: %v", err)
	}

	input.Title = "Published harbour home"
	input.Status = "published"
	updated, err := store.UpdateManaged(ctx, created.ID, input)
	if err != nil {
		t.Fatalf("update managed property: %v", err)
	}
	if updated.Status != "published" || updated.Title != input.Title || len(updated.Media) != 1 || updated.Media[0].URL != media.URL {
		t.Fatalf("updated property = %#v", updated)
	}
}

func TestPropertyAllowsOnlyOnePanorama(t *testing.T) {
	ctx := context.Background()
	transaction := newTestTransaction(t)
	var propertyID string
	if err := transaction.QueryRow(ctx, `SELECT id::text FROM properties ORDER BY id LIMIT 1`).Scan(&propertyID); err != nil {
		t.Fatalf("find property: %v", err)
	}
	if _, err := transaction.Exec(ctx, `DELETE FROM property_media WHERE property_id=$1 AND kind='panorama'`, propertyID); err != nil {
		t.Fatalf("clear seeded panorama: %v", err)
	}
	if _, err := transaction.Exec(ctx, `INSERT INTO property_media(id,property_id,kind,url,alt_text,position) VALUES(gen_random_uuid(),$1,'panorama','https://kuula.co/share/first','First',30000)`, propertyID); err != nil {
		t.Fatalf("insert first panorama: %v", err)
	}
	if _, err := transaction.Exec(ctx, `INSERT INTO property_media(id,property_id,kind,url,alt_text,position) VALUES(gen_random_uuid(),$1,'panorama','https://kuula.co/share/second','Second',30001)`, propertyID); err == nil {
		t.Fatal("inserted a second panorama for one property")
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

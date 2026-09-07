package property_test

import (
	"context"
	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
	"testing"
)

func TestImagesPersistAndOrder(t *testing.T) {
	tx := newTestTransaction(t)
	ctx := context.Background()
	store := property.NewStore(tx)
	const id = "88888888-8888-4888-8888-888888888888"
	_, err := tx.Exec(ctx, `INSERT INTO properties (id,title,address_line1,city,county,price_cents,bedrooms,property_type,location,status) VALUES ($1,'Image test','Test','Test','Dublin',100,1,'apartment',ST_SetSRID(ST_MakePoint(-6,53),4326)::geography,'draft')`, id)
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range []struct{ kind, url string }{{"image", "/first"}, {"floor_plan", "/plan"}, {"image", "/second"}} {
		if _, err = store.AddImage(ctx, id, m.kind, m.url, "Test image"); err != nil {
			t.Fatal(err)
		}
	}
	media, err := store.OrderImages(ctx, id, []string{"/second", "/first"})
	if err != nil {
		t.Fatal(err)
	}
	if len(media) != 3 || media[0].URL != "/second" || media[1].URL != "/plan" || media[2].URL != "/first" {
		t.Fatalf("unexpected media: %#v", media)
	}
	if _, err = store.OrderImages(ctx, id, []string{"/second", "/second"}); err == nil {
		t.Fatal("duplicate order accepted")
	}
	visible, err := store.ImagePublished(ctx, "/first")
	if err != nil || visible {
		t.Fatal("draft image public")
	}
	updated, err := store.UpdateImageDescription(ctx, id, "/plan", "Measured ground floor")
	if err != nil || updated.AltText != "Measured ground floor" || updated.Position != 1 || updated.Kind != "floor_plan" {
		t.Fatalf("description update: %#v %v", updated, err)
	}
	if _, err = store.UpdateImageDescription(ctx, "99999999-9999-4999-8999-999999999999", "/plan", "Wrong property"); err != property.ErrNotFound {
		t.Fatalf("cross-property update: %v", err)
	}
	var stored string
	if err = tx.QueryRow(ctx, `SELECT alt_text FROM property_media WHERE property_id=$1 AND url='/plan'`, id).Scan(&stored); err != nil || stored != "Measured ground floor" {
		t.Fatalf("persisted description: %s %v", stored, err)
	}
}

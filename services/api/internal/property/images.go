package property

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5"
)

func (store *Store) AddImage(ctx context.Context, id, kind, url, description string) (Media, error) {
	var media Media
	mediaID, err := randomUUID()
	if err != nil {
		return media, err
	}
	err = store.database.QueryRow(ctx, `WITH target AS (SELECT id FROM properties WHERE id=$1::uuid FOR UPDATE)
 INSERT INTO property_media (id,property_id,kind,url,alt_text,position)
 SELECT $2::uuid,target.id,$3::property_media_kind,$4,$5,COALESCE((SELECT MAX(position)+1 FROM property_media WHERE property_id=target.id),0) FROM target
 RETURNING url,kind::text,alt_text,position`, id, mediaID, kind, url, description).Scan(&media.URL, &media.Kind, &media.AltText, &media.Position)
	if err == pgx.ErrNoRows {
		err = ErrNotFound
	}
	return media, err
}

func (store *Store) OrderImages(ctx context.Context, id string, urls []string) ([]Media, error) {
	tx, err := store.database.(interface {
		Begin(context.Context) (pgx.Tx, error)
	}).Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var locked string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM properties WHERE id=$1::uuid FOR UPDATE", id).Scan(&locked); err != nil {
		return nil, ErrNotFound
	}
	rows, err := tx.Query(ctx, "SELECT url,kind::text,alt_text,position FROM property_media WHERE property_id=$1::uuid ORDER BY position", id)
	if err != nil {
		return nil, err
	}
	var all []Media
	images := map[string]Media{}
	maxPosition := 0
	for rows.Next() {
		var m Media
		if err = rows.Scan(&m.URL, &m.Kind, &m.AltText, &m.Position); err != nil {
			rows.Close()
			return nil, err
		}
		all = append(all, m)
		if m.Kind == "image" {
			images[m.URL] = m
		}
		if int(m.Position) > maxPosition {
			maxPosition = int(m.Position)
		}
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}
	if len(urls) != len(images) || len(urls) == 0 {
		return nil, ErrNotFound
	}
	ordered := make([]Media, 0, len(urls))
	for _, url := range urls {
		m, ok := images[url]
		if !ok {
			return nil, ErrNotFound
		}
		ordered = append(ordered, m)
		delete(images, url)
	}
	if maxPosition*2+1 > 32767 {
		return nil, fmt.Errorf("media position capacity exceeded")
	}
	if _, err = tx.Exec(ctx, "UPDATE property_media SET position=position+$2 WHERE property_id=$1::uuid", id, maxPosition+1); err != nil {
		return nil, err
	}
	next := 0
	for i, m := range all {
		if m.Kind == "image" {
			m = ordered[next]
			next++
		}
		m.Position = int16(i)
		all[i] = m
		if _, err = tx.Exec(ctx, "UPDATE property_media SET position=$3 WHERE property_id=$1::uuid AND url=$2", id, m.URL, i); err != nil {
			return nil, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return all, nil
}

func (store *Store) ImagePublished(ctx context.Context, url string) (bool, error) {
	var published bool
	err := store.database.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM property_media m JOIN properties p ON p.id=m.property_id WHERE m.url=$1 AND p.status='published')`, url).Scan(&published)
	return published, err
}

func (store *Store) UpdateImageDescription(ctx context.Context, id, url, description string) (Media, error) {
	var media Media
	err := store.database.QueryRow(ctx, `UPDATE property_media SET alt_text=$3 WHERE property_id=$1::uuid AND url=$2 AND kind IN ('image','floor_plan') RETURNING url,kind::text,alt_text,position`, id, url, description).Scan(&media.URL, &media.Kind, &media.AltText, &media.Position)
	if err == pgx.ErrNoRows {
		err = ErrNotFound
	}
	return media, err
}

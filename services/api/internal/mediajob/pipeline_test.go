package mediajob

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// Exercise the real upload/store/encoder/publication boundary, not a queue stub.
// Database tables and filesystem outputs are isolated from application data.
func TestVideoUploadPipeline(t *testing.T) {
	if os.Getenv("MEDIA_TEST_FFMPEG") != "1" {
		t.Skip("set MEDIA_TEST_FFMPEG=1 and TEST_DATABASE_URL for pipeline integration")
	}
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Fatal("FFmpeg required for pipeline integration")
	}
	for _, validVideo := range []bool{true, false} {
		name := "video publishes once"
		if !validVideo {
			name = "audio-only upload fails without publication"
		}
		t.Run(name, func(t *testing.T) {
			store, pool := isolatedStore(t)
			ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
			defer cancel()
			const propertyID = "10000000-0000-4000-8000-000000000001"
			// Retire the helper's seed job and preserve an existing gallery item.
			if _, err := pool.Exec(ctx, `
				UPDATE media_jobs SET status = 'failed';
				INSERT INTO property_media (id, property_id, kind, url, alt_text, position)
				VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'image', '/existing.jpg', 'Existing photo', 0);
			`); err != nil {
				t.Fatal(err)
			}
			root := t.TempDir()
			fixture := filepath.Join(root, "input.mp4")
			args := []string{"-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=duration=0.2", "-c:a", "aac", fixture}
			if validVideo {
				args = []string{"-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:size=64x48:rate=30:duration=0.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", fixture}
			}
			if err := exec.CommandContext(ctx, ffmpeg, args...).Run(); err != nil {
				t.Fatalf("generate fixture: %v", err)
			}
			input, err := os.Open(fixture)
			if err != nil {
				t.Fatal(err)
			}
			defer input.Close()
			job, err := NewUploadService(filepath.Join(root, "sources"), store).AcceptUpload(ctx, propertyID, "tour.mp4", input)
			if err != nil {
				t.Fatalf("accept upload: %v", err)
			}
			queued, err := store.Get(ctx, job.ID)
			if err != nil || queued.Status != StatusPending || queued.Attempts != 0 {
				t.Fatalf("upload not queued: %+v, %v", queued, err)
			}
			output := filepath.Join(root, "output")
			processor := NewProcessor(store, ffmpeg, output, "/media/test")
			processingErr := processor.ProcessNext(ctx)
			saved, err := store.Get(ctx, job.ID)
			if err != nil {
				t.Fatal(err)
			}
			if saved.Attempts != 1 || saved.CompletedAt == nil {
				t.Fatalf("missing terminal metadata: %+v", saved)
			}
			var galleryCount int
			if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM property_media`).Scan(&galleryCount); err != nil {
				t.Fatal(err)
			}
			if !validVideo {
				if processingErr == nil || saved.Status != StatusFailed || saved.OutputPath != "" || galleryCount != 1 {
					t.Fatalf("invalid source published: status=%s, count=%d, error=%v", saved.Status, galleryCount, processingErr)
				}
				if _, err := os.Stat(job.SourcePath); err != nil {
					t.Fatal("failed upload source was lost")
				}
				entries, err := os.ReadDir(output)
				if err != nil || len(entries) != 0 {
					t.Fatal("failed upload left public artifacts")
				}
			} else {
				wantURL := "/media/test/" + job.ID + "-1.mp4"
				if processingErr != nil || saved.Status != StatusReady || saved.OutputPath != wantURL || galleryCount != 2 {
					t.Fatalf("video not published: status=%s, count=%d, error=%v", saved.Status, galleryCount, processingErr)
				}
				var position int
				if err := pool.QueryRow(ctx, `SELECT position FROM property_media WHERE property_id = $1 AND kind = 'video' AND url = $2`, propertyID, wantURL).Scan(&position); err != nil || position != 1 {
					t.Fatalf("gallery append: position=%d, error=%v", position, err)
				}
				if _, err := os.Stat(job.SourcePath); !errors.Is(err, os.ErrNotExist) {
					t.Fatal("completed upload retained its source")
				}
				published := filepath.Join(output, job.ID+"-1.mp4")
				if err := exec.CommandContext(ctx, ffmpeg, "-nostdin", "-v", "error", "-xerror", "-i", published, "-f", "null", "-").Run(); err != nil {
					t.Fatalf("published video is not decodable: %v", err)
				}
				if err := store.Complete(ctx, job.ID, 1, wantURL, "30000000-0000-4000-8000-000000000002"); err != nil {
					t.Fatalf("completion replay: %v", err)
				}
				if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM property_media`).Scan(&galleryCount); err != nil || galleryCount != 2 {
					t.Fatal("completion replay duplicated gallery media")
				}
			}
			if err := processor.ProcessNext(ctx); !errors.Is(err, ErrQueueEmpty) {
				t.Fatalf("terminal job was processed again: %v", err)
			}
		})
	}
}

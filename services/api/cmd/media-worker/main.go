package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	checkOnly := flag.Bool("check", false, "validate database, output storage and encoder without claiming jobs")
	statusOnly := flag.Bool("status", false, "print read-only queue counts as JSON without claiming jobs")
	once := flag.Bool("once", false, "process at most one job and exit; an empty queue is success")
	flag.Parse()
	if flag.NArg() != 0 {
		log.Fatal("unexpected positional arguments")
	}
	if (*checkOnly && *statusOnly) || (*once && (*checkOnly || *statusOnly)) {
		log.Fatal("choose only one of --check, --status or --once")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	outputRoot := os.Getenv("MEDIA_OUTPUT_DIR")
	if outputRoot == "" {
		outputRoot = "../../apps/web/public/media/uploads"
	}
	publicPrefix := os.Getenv("MEDIA_PUBLIC_PREFIX")
	if publicPrefix == "" {
		publicPrefix = "/media/uploads"
	}
	ffmpegPath := os.Getenv("FFMPEG_PATH")
	if ffmpegPath == "" {
		ffmpegPath = "ffmpeg"
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	startup, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(startup, databaseURL)
	if err != nil {
		log.Fatal("invalid database configuration")
	}
	defer pool.Close()
	if err := pool.Ping(startup); err != nil {
		log.Fatal("worker database is unreachable")
	}
	if *statusOnly {
		status, err := mediajob.NewStore(pool).QueueStatus(startup)
		if err != nil {
			log.Fatal("queue status unavailable; verify database schema and read permissions")
		}
		if err := json.NewEncoder(os.Stdout).Encode(status); err != nil {
			log.Fatal("could not write queue status")
		}
		return
	}
	// Read-only probes detect missing migrations before any queue claim.
	if _, err := pool.Exec(startup, `
		SELECT id, property_id, source_path, output_path, status, attempts,
		       error_message, created_at, started_at, completed_at FROM media_jobs LIMIT 0;
		SELECT id FROM properties LIMIT 0;
		SELECT id, property_id, kind, url, alt_text, position FROM property_media LIMIT 0;
	`); err != nil {
		log.Fatal("worker schema check failed; verify database migrations and read permissions")
	}
	if err := checkOutputDirectory(outputRoot); err != nil {
		log.Fatal(err)
	}
	ffmpegPath, err = checkEncoder(startup, ffmpegPath)
	if err != nil {
		log.Fatal(err)
	}
	cancel()
	if *checkOnly {
		log.Print("media worker checks passed; no jobs claimed")
		return
	}

	log.Print("media worker started")
	processor := mediajob.NewProcessor(mediajob.NewStore(pool), ffmpegPath, outputRoot, publicPrefix)
	if *once {
		if err := processOnce(ctx, processor); err != nil {
			log.Fatal("single-job processing did not complete; inspect queue status before retrying")
		}
		log.Print("single-job run finished; no further jobs claimed")
		return
	}
	if err := processor.Run(ctx); err != nil {
		log.Fatalf("run media worker: %v", err)
	}
	log.Print("media worker stopped")
}

func processOnce(ctx context.Context, processor *mediajob.Processor) error {
	err := processor.ProcessNext(ctx)
	if errors.Is(err, mediajob.ErrQueueEmpty) {
		return nil
	}
	return err
}

func checkEncoder(ctx context.Context, executable string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	path, err := exec.LookPath(executable)
	if err != nil {
		return "", errors.New("FFmpeg executable unavailable; check FFMPEG_PATH")
	}
	probeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	// Exercise the codecs used by the worker without reading uploads or writing
	// published media. Version output alone does not prove codec availability.
	command := exec.CommandContext(probeCtx, path, "-nostdin", "-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "color=size=64x48:rate=30:duration=0.1",
		"-f", "lavfi", "-i", "sine=duration=0.1",
		"-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-t", "0.1", "-f", "null", "-")
	command.Stdout, command.Stderr = io.Discard, io.Discard
	command.WaitDelay = 2 * time.Second
	if err := command.Run(); err != nil {
		if probeCtx.Err() != nil {
			return "", probeCtx.Err()
		}
		return "", errors.New("FFmpeg H.264/AAC self-test failed; check encoder installation")
	}
	return path, nil
}

func checkOutputDirectory(root string) error {
	if err := os.MkdirAll(root, 0o750); err != nil {
		return errors.New("media output directory unavailable")
	}
	probe, err := os.CreateTemp(root, ".worker-check-*")
	if err != nil {
		return errors.New("media output directory is not writable")
	}
	_, writeErr := probe.Write([]byte("worker storage check"))
	syncErr := probe.Sync()
	closeErr := probe.Close()
	removeErr := os.Remove(probe.Name())
	if errors.Join(writeErr, syncErr, closeErr, removeErr) != nil {
		return errors.New("media output write or cleanup check failed")
	}
	return nil
}

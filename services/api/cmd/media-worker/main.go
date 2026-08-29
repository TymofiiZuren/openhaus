package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
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
	startup, cancel := context.WithTimeout(ctx, 10*time.Second)
	pool, err := pgxpool.New(startup, databaseURL)
	cancel()
	if err != nil {
		log.Fatalf("configure database pool: %v", err)
	}
	defer pool.Close()

	log.Print("media worker started")
	processor := mediajob.NewProcessor(mediajob.NewStore(pool), ffmpegPath, outputRoot, publicPrefix)
	if err := processor.Run(ctx); err != nil {
		log.Fatalf("run media worker: %v", err)
	}
	log.Print("media worker stopped")
}

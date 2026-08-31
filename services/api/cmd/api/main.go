package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/httpapi"
	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
	"github.com/jackc/pgx/v5/pgxpool"
)

const shutdownPeriod = 10 * time.Second

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	startupContext, cancelStartup := context.WithTimeout(context.Background(), 10*time.Second)
	databasePool, err := connectDatabase(startupContext, databaseURL)
	cancelStartup()
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer databasePool.Close()

	propertyStore := property.NewStore(databasePool)
	mediaJobStore := mediajob.NewStore(databasePool)
	managerAuth := managerauth.NewService(managerauth.NewStore(databasePool))
	uploadRoot := os.Getenv("MEDIA_SOURCE_DIR")
	if uploadRoot == "" {
		uploadRoot = ".data/uploads"
	}
	serverAddress := os.Getenv("HTTP_ADDR")
	if serverAddress == "" {
		serverAddress = ":8080"
	}
	server := &http.Server{
		Addr: serverAddress,
		Handler: httpapi.NewRouter(httpapi.Dependencies{
			Readiness:             databasePool,
			Properties:            propertyStore,
			Videos:                mediajob.NewUploadService(uploadRoot, mediaJobStore),
			Jobs:                  mediaJobStore,
			ManagerAuth:           managerAuth,
			ManagerProperties:     propertyStore,
			ManagerPropertyWriter: propertyStore,
			SecureCookies:         os.Getenv("APP_ENV") == "production",
		}),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdownSignal, stop := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer stop()

	serverErrors := make(chan error, 1)

	go func() {
		log.Printf("API listening on %s", server.Addr)
		serverErrors <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("serve API: %v", err)
		}

	case <-shutdownSignal.Done():
		log.Print("shutdown signal received")
	}

	shutdownContext, cancel := context.WithTimeout(
		context.Background(),
		shutdownPeriod,
	)
	defer cancel()

	if err := server.Shutdown(shutdownContext); err != nil {
		log.Printf("graceful shutdown: %v", err)
	}

	log.Print("API stopped")
}

func connectDatabase(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

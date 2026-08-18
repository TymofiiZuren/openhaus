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
	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	serverAddress  = ":8080"
	shutdownPeriod = 10 * time.Second
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	startupContext, cancelStartup := context.WithTimeout(context.Background(), 10*time.Second)
	databasePool, err := pgxpool.New(startupContext, databaseURL)
	cancelStartup()
	if err != nil {
		log.Fatalf("configure database pool: %v", err)
	}
	defer databasePool.Close()

	propertyStore := property.NewStore(databasePool)
	server := &http.Server{
		Addr: serverAddress,
		Handler: httpapi.NewRouter(httpapi.Dependencies{
			Readiness:  databasePool,
			Properties: propertyStore,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
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

package main

import (
	"context"
	"errors"
	"log"
	"os"
	"strings"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	email := strings.ToLower(strings.TrimSpace(os.Getenv("MANAGER_EMAIL")))
	password := os.Getenv("MANAGER_PASSWORD")
	if databaseURL == "" || email == "" || password == "" {
		log.Fatal("DATABASE_URL, MANAGER_EMAIL, and MANAGER_PASSWORD are required")
	}
	passwordHash, err := managerauth.HashPassword(password)
	if err != nil {
		log.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()

	transaction, err := pool.Begin(ctx)
	if err != nil {
		log.Fatalf("begin password reset: %v", err)
	}
	defer transaction.Rollback(ctx) //nolint:errcheck -- rollback after commit is harmless

	var managerID string
	err = transaction.QueryRow(ctx, `
		UPDATE manager_users
		SET password_hash = $2, updated_at = now()
		WHERE email = $1
		RETURNING id::text
	`, email, passwordHash).Scan(&managerID)
	if errors.Is(err, pgx.ErrNoRows) {
		log.Fatalf("manager not found for %s", email)
	}
	if err != nil {
		log.Fatalf("reset manager password: %v", err)
	}
	if _, err := transaction.Exec(ctx, `DELETE FROM manager_sessions WHERE manager_user_id = $1::uuid`, managerID); err != nil {
		log.Fatalf("revoke manager sessions: %v", err)
	}
	if err := transaction.Commit(ctx); err != nil {
		log.Fatalf("commit password reset: %v", err)
	}
	log.Printf("manager password reset and sessions revoked for %s", email)
}

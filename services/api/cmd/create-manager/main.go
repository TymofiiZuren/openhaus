package main

import (
	"context"
	"log"
	"os"
	"strings"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
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
	if _, err := pool.Exec(ctx, `INSERT INTO manager_users (email, password_hash) VALUES ($1, $2)`, email, passwordHash); err != nil {
		log.Fatalf("create manager: %v", err)
	}
	log.Printf("manager created for %s", email)
}

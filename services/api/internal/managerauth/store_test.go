package managerauth_test

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPostgresSessionLifecycle(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin transaction: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	hash, err := managerauth.HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO manager_users (email, password_hash) VALUES ('manager-test@example.com', $1)`, hash); err != nil {
		t.Fatalf("insert manager: %v", err)
	}
	service := managerauth.NewService(managerauth.NewStore(tx))
	session, err := service.Login(ctx, "manager-test@example.com", "correct horse battery staple")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	user, err := service.Authenticate(ctx, session.Token)
	if err != nil || user.Email != "manager-test@example.com" {
		t.Fatalf("authenticate user = %#v, error = %v", user, err)
	}
	if err := service.Logout(ctx, session.Token); err != nil {
		t.Fatalf("logout: %v", err)
	}
	if _, err := service.Authenticate(ctx, session.Token); !errors.Is(err, managerauth.ErrUnauthenticated) && !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("authenticate after logout error = %v, want unauthenticated", err)
	}
}

func TestPostgresPasswordChangeRevokesEverySession(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin transaction: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	hash, err := managerauth.HashPassword("current secure password")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	var userID string
	if err := tx.QueryRow(ctx, `INSERT INTO manager_users (email, password_hash) VALUES ('password-change@example.com', $1) RETURNING id`, hash).Scan(&userID); err != nil {
		t.Fatalf("insert manager: %v", err)
	}
	service := managerauth.NewService(managerauth.NewStore(tx))
	first, err := service.Login(ctx, "password-change@example.com", "current secure password")
	if err != nil {
		t.Fatalf("first login: %v", err)
	}
	second, err := service.Login(ctx, "password-change@example.com", "current secure password")
	if err != nil {
		t.Fatalf("second login: %v", err)
	}
	if err := service.ChangePassword(ctx, managerauth.User{ID: userID, Email: "password-change@example.com"}, "current secure password", "replacement secure password"); err != nil {
		t.Fatalf("change password: %v", err)
	}
	for _, token := range []string{first.Token, second.Token} {
		if _, err := service.Authenticate(ctx, token); !errors.Is(err, managerauth.ErrUnauthenticated) && !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("authenticate revoked session error = %v, want unauthenticated", err)
		}
	}
	if _, err := service.Login(ctx, "password-change@example.com", "current secure password"); !errors.Is(err, managerauth.ErrInvalidCredentials) {
		t.Fatalf("old password login error = %v, want invalid credentials", err)
	}
	if _, err := service.Login(ctx, "password-change@example.com", "replacement secure password"); err != nil {
		t.Fatalf("new password login: %v", err)
	}
}

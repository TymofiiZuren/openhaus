package clientauth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestDatabaseAccountIsolationAndExpiry(t *testing.T) {
	connection := os.Getenv("TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, connection)
	if err != nil {
		t.Fatal("database connection failed")
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal("transaction failed")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	// Test the migration in an isolated, transaction-local schema; no persistent
	// users, credentials or schema changes survive the rollback.
	schema := pgx.Identifier{"client_test_" + time.Now().Format("150405000000000")}.Sanitize()
	if _, err = tx.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal("test schema creation failed")
	}
	if _, err = tx.Exec(ctx, "SET LOCAL search_path TO "+schema+",public"); err != nil {
		t.Fatal("test schema selection failed")
	}
	migration, err := os.ReadFile("../../../../db/migrations/000005_create_client_accounts.up.sql")
	if err != nil {
		t.Fatal("migration read failed")
	}
	if _, err = tx.Exec(ctx, string(migration)); err != nil {
		t.Fatal("client migration failed")
	}
	store := NewStore(tx)
	service := NewService(store)
	secret := make([]byte, 24)
	if _, err = rand.Read(secret); err != nil {
		t.Fatal("random generation failed")
	}
	password := base64.RawURLEncoding.EncodeToString(secret)
	if err = service.Register(ctx, "buyer-integration@example.com", password, "127.0.0.1"); err != nil {
		t.Fatal("registration failed")
	}
	if err = service.Register(ctx, "buyer-integration@example.com", password, "127.0.0.1"); err != nil {
		t.Fatal("duplicate registration leaked state")
	}
	session, err := service.Login(ctx, "buyer-integration@example.com", password, "127.0.0.1")
	if err != nil {
		t.Fatal("login failed")
	}
	digest := sha256.Sum256([]byte(session.Token))
	if _, _, err = store.FindSession(ctx, digest[:], time.Now().Add(25*time.Hour)); err == nil {
		t.Fatal("expired session accepted")
	}
	if _, err = service.Authenticate(ctx, session.Token); err != nil {
		t.Fatal("valid session rejected")
	}
	secondSession, err := service.Login(ctx, "buyer-integration@example.com", password, "127.0.0.1")
	if err != nil {
		t.Fatal("second login failed")
	}
	newPassword := password + "-updated"
	if err = service.ChangePassword(ctx, session.User, password, newPassword); err != nil {
		t.Fatal("password change failed")
	}
	for _, token := range []string{session.Token, secondSession.Token} {
		if _, err = service.Authenticate(ctx, token); err == nil {
			t.Fatal("password change left a database session active")
		}
	}
	if _, err = service.Login(ctx, "buyer-integration@example.com", password, "127.0.0.1"); err == nil {
		t.Fatal("database accepted the old password")
	}
	newSession, err := service.Login(ctx, "buyer-integration@example.com", newPassword, "127.0.0.1")
	if err != nil {
		t.Fatal("database rejected the new password")
	}
	if err = service.Logout(ctx, newSession.Token); err != nil {
		t.Fatal("logout failed")
	}
	key := sha256.Sum256([]byte("limit-test"))
	now := time.Now()
	for i := 0; i < 3; i++ {
		allowed, err := store.AllowAttempt(ctx, key[:], now, 2)
		if err != nil || allowed != (i < 2) {
			t.Fatal("database rate limit incorrect")
		}
	}
	if allowed, err := store.AllowAttempt(ctx, key[:], now.Add(16*time.Minute), 2); err != nil || !allowed {
		t.Fatal("rate limit did not expire")
	}
	deletionSession, err := service.Login(ctx, "buyer-integration@example.com", newPassword, "127.0.0.1")
	if err != nil {
		t.Fatal("account could not reauthenticate before deletion")
	}
	if err = service.DeleteAccount(ctx, deletionSession.User, newPassword, "127.0.0.1"); err != nil {
		t.Fatal("database account deletion failed")
	}
	if _, err = service.Authenticate(ctx, deletionSession.Token); err == nil {
		t.Fatal("deleted account session remained valid")
	}
	if _, err = service.Login(ctx, "buyer-integration@example.com", newPassword, "127.0.0.1"); err == nil {
		t.Fatal("deleted database account could still sign in")
	}
}

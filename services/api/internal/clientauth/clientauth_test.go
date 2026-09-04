package clientauth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"testing"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
	"golang.org/x/crypto/bcrypt"
)

type memoryStore struct {
	email, hash string
	sessions    map[string]bool
	allowed     bool
}

func (s *memoryStore) CreateUser(_ context.Context, email, hash string) error {
	if s.email != "" {
		return nil
	}
	s.email, s.hash = email, hash
	return nil
}
func (s *memoryStore) AllowAttempt(context.Context, []byte, time.Time, int) (bool, error) {
	return s.allowed, nil
}
func (s *memoryStore) FindUserByEmail(_ context.Context, email string) (managerauth.User, string, error) {
	if email != s.email {
		return managerauth.User{}, "", managerauth.ErrInvalidCredentials
	}
	return managerauth.User{ID: "buyer", Email: s.email}, s.hash, nil
}
func (s *memoryStore) CreateSession(_ context.Context, _ string, digest []byte, _ time.Time) error {
	s.sessions[string(digest)] = true
	return nil
}
func (s *memoryStore) FindSession(_ context.Context, digest []byte, _ time.Time) (managerauth.User, time.Time, error) {
	if !s.sessions[string(digest)] {
		return managerauth.User{}, time.Time{}, managerauth.ErrUnauthenticated
	}
	return managerauth.User{ID: "buyer", Email: s.email}, time.Time{}, nil
}
func (s *memoryStore) DeleteSession(_ context.Context, digest []byte) error {
	delete(s.sessions, string(digest))
	return nil
}

func TestRegistrationAndSessionLifecycle(t *testing.T) {
	repo := &memoryStore{allowed: true, sessions: map[string]bool{}}
	service := NewService(repo)
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		t.Fatal("random generation failed")
	}
	password := base64.RawURLEncoding.EncodeToString(bytes)
	if err := service.Register(context.Background(), " Buyer@example.com ", password, "127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	if repo.email != "buyer@example.com" || bcrypt.CompareHashAndPassword([]byte(repo.hash), []byte(password)) != nil {
		t.Fatal("registration did not normalize email and hash password")
	}
	session, err := service.Login(context.Background(), "buyer@example.com", password, "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.Authenticate(context.Background(), session.Token); err != nil {
		t.Fatal(err)
	}
	if err = service.Logout(context.Background(), session.Token); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Authenticate(context.Background(), session.Token); !errors.Is(err, managerauth.ErrUnauthenticated) {
		t.Fatal("revoked session accepted")
	}
	repo.allowed = false
	if _, err = service.Login(context.Background(), "buyer@example.com", password, "127.0.0.1"); !errors.Is(err, ErrRateLimited) {
		t.Fatal("rate limit bypassed")
	}
}

func TestRejectInvalidRegistration(t *testing.T) {
	service := NewService(&memoryStore{allowed: true})
	for _, email := range []string{"not-an-email", "Name <person@example.com>", ""} {
		if err := service.Register(context.Background(), email, "", "127.0.0.1"); !errors.Is(err, ErrInvalidInput) {
			t.Fatal("invalid registration accepted")
		}
	}
}

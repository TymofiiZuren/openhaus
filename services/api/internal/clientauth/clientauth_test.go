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
	deleted     bool
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
func (s *memoryStore) ChangePasswordAndDeleteSessions(_ context.Context, userID, currentHash, newHash string) error {
	if userID != "buyer" || s.hash != currentHash {
		return managerauth.ErrUnauthenticated
	}
	s.hash = newHash
	clear(s.sessions)
	return nil
}
func (s *memoryStore) DeleteUserSessions(_ context.Context, userID string) error {
	if userID == "buyer" {
		clear(s.sessions)
	}
	return nil
}
func (s *memoryStore) DeleteUser(_ context.Context, userID, passwordHash string) (bool, error) {
	if userID != "buyer" || s.hash != passwordHash {
		return false, nil
	}
	s.deleted = true
	s.email, s.hash = "", ""
	clear(s.sessions)
	return true, nil
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

func TestChangePasswordRevokesEveryClientSession(t *testing.T) {
	repo := &memoryStore{allowed: true, sessions: map[string]bool{}}
	service := NewService(repo)
	const oldPassword = "correct horse battery staple"
	const newPassword = "new unique password phrase"
	if err := service.Register(context.Background(), "buyer@example.test", oldPassword, "127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	first, err := service.Login(context.Background(), repo.email, oldPassword, "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Login(context.Background(), repo.email, oldPassword, "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	if err = service.ChangePassword(context.Background(), first.User, oldPassword, newPassword); err != nil {
		t.Fatal(err)
	}
	for _, token := range []string{first.Token, second.Token} {
		if _, err = service.Authenticate(context.Background(), token); !errors.Is(err, managerauth.ErrUnauthenticated) {
			t.Fatal("password change left an existing client session active")
		}
	}
	if _, err = service.Login(context.Background(), repo.email, oldPassword, "127.0.0.1"); !errors.Is(err, managerauth.ErrInvalidCredentials) {
		t.Fatal("old password remained valid")
	}
	if _, err = service.Login(context.Background(), repo.email, newPassword, "127.0.0.1"); err != nil {
		t.Fatalf("new password was rejected: %v", err)
	}
}

func TestDeleteAccountRequiresCurrentPasswordAndRevokesIdentity(t *testing.T) {
	repo := &memoryStore{allowed: true, sessions: map[string]bool{}}
	service := NewService(repo)
	const password = "correct horse battery staple"
	if err := service.Register(context.Background(), "buyer@example.test", password, "127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	session, err := service.Login(context.Background(), repo.email, password, "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	if err = service.DeleteAccount(context.Background(), session.User, "wrong password phrase", "127.0.0.1"); !errors.Is(err, managerauth.ErrInvalidCredentials) {
		t.Fatalf("wrong password deletion error = %v", err)
	}
	if repo.deleted {
		t.Fatal("wrong password deleted the account")
	}
	if err = service.DeleteAccount(context.Background(), session.User, password, "127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	if !repo.deleted {
		t.Fatal("verified account was not deleted")
	}
	if _, err = service.Authenticate(context.Background(), session.Token); !errors.Is(err, managerauth.ErrUnauthenticated) {
		t.Fatal("deleted account session remained active")
	}
}

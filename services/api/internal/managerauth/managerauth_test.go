package managerauth_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
)

type repositoryStub struct {
	user         managerauth.User
	passwordHash string
	findErr      error
	storedHash   []byte
}

func (stub *repositoryStub) FindUserByEmail(context.Context, string) (managerauth.User, string, error) {
	return stub.user, stub.passwordHash, stub.findErr
}
func (stub *repositoryStub) CreateSession(_ context.Context, _ string, hash []byte, _ time.Time) error {
	stub.storedHash = hash
	return nil
}
func (stub *repositoryStub) FindSession(context.Context, []byte, time.Time) (managerauth.User, time.Time, error) {
	return stub.user, time.Now().Add(time.Hour), stub.findErr
}
func (stub *repositoryStub) DeleteSession(context.Context, []byte) error { return nil }

func TestLoginCreatesOpaqueSession(t *testing.T) {
	hash, err := managerauth.HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	repository := &repositoryStub{user: managerauth.User{ID: "manager-1", Email: "manager@example.com"}, passwordHash: hash}

	session, err := managerauth.NewService(repository).Login(context.Background(), " Manager@Example.com ", "correct horse battery staple")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if session.Token == "" || len(repository.storedHash) != 32 {
		t.Fatalf("session token/hash were not generated")
	}
	if string(repository.storedHash) == session.Token {
		t.Fatal("raw session token was stored")
	}
}

func TestLoginRejectsWrongPassword(t *testing.T) {
	hash, _ := managerauth.HashPassword("correct horse battery staple")
	_, err := managerauth.NewService(&repositoryStub{passwordHash: hash}).Login(context.Background(), "manager@example.com", "wrong password")
	if !errors.Is(err, managerauth.ErrInvalidCredentials) {
		t.Fatalf("error = %v, want invalid credentials", err)
	}
}

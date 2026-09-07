package managerauth_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
	"golang.org/x/crypto/bcrypt"
)

type repositoryStub struct {
	user         managerauth.User
	passwordHash string
	findErr      error
	storedHash   []byte
	changedHash  string
	revokedUser  string
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
func (stub *repositoryStub) ChangePasswordAndDeleteSessions(_ context.Context, userID, _ string, hash string) error {
	stub.revokedUser, stub.changedHash = userID, hash
	return nil
}
func (stub *repositoryStub) DeleteUserSessions(_ context.Context, userID string) error {
	stub.revokedUser = userID
	return nil
}

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

func TestChangePasswordVerifiesCurrentPasswordAndRevokesSessions(t *testing.T) {
	currentHash, _ := managerauth.HashPassword("correct horse battery staple")
	user := managerauth.User{ID: "manager-1", Email: "manager@example.com"}
	repository := &repositoryStub{user: user, passwordHash: currentHash}
	service := managerauth.NewService(repository)

	if err := service.ChangePassword(context.Background(), user, "wrong password", "a different secure password"); !errors.Is(err, managerauth.ErrInvalidCredentials) {
		t.Fatalf("wrong current password error = %v", err)
	}
	if repository.changedHash != "" {
		t.Fatal("password changed after invalid current password")
	}
	if err := service.ChangePassword(context.Background(), user, "correct horse battery staple", "a different secure password"); err != nil {
		t.Fatalf("change password: %v", err)
	}
	if repository.revokedUser != user.ID || bcrypt.CompareHashAndPassword([]byte(repository.changedHash), []byte("a different secure password")) != nil {
		t.Fatal("new password was not hashed or sessions were not revoked")
	}
}

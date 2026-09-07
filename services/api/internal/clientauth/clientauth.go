// Package clientauth provides buyer-only accounts. The credential/session engine
// is shared with managerauth, but its repository never reads manager tables.
package clientauth

import (
	"context"
	"crypto/sha256"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
)

var ErrInvalidInput = errors.New("invalid registration")
var ErrRateLimited = errors.New("too many attempts")

type Repository interface {
	managerauth.Repository
	CreateUser(context.Context, string, string) error
	AllowAttempt(context.Context, []byte, time.Time, int) (bool, error)
	DeleteUser(context.Context, string, string) (bool, error)
}
type Service struct {
	repository Repository
	sessions   *managerauth.Service
}

func NewService(repository Repository) *Service {
	return &Service{repository: repository, sessions: managerauth.NewService(repository)}
}

func (s *Service) limit(ctx context.Context, email, address string) error {
	for _, entry := range []struct {
		key     string
		maximum int
	}{{"email:" + email, 20}, {"address:" + address, 60}} {
		digest := sha256.Sum256([]byte(entry.key))
		allowed, err := s.repository.AllowAttempt(ctx, digest[:], time.Now(), entry.maximum)
		if err != nil {
			return err
		}
		if !allowed {
			return ErrRateLimited
		}
	}
	return nil
}
func (s *Service) Register(ctx context.Context, email, password, address string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || len(email) > 320 || len(password) < 12 || len(password) > 72 {
		return ErrInvalidInput
	}
	if err = s.limit(ctx, email, address); err != nil {
		return err
	}
	hash, err := managerauth.HashPassword(password)
	if err != nil {
		return err
	}
	// CreateUser is a no-op for existing addresses: never overwrite a password,
	// and give the same HTTP response whether the account already exists or not.
	return s.repository.CreateUser(ctx, email, hash)
}
func (s *Service) Login(ctx context.Context, email, password, address string) (managerauth.Session, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if err := s.limit(ctx, email, address); err != nil {
		return managerauth.Session{}, err
	}
	return s.sessions.Login(ctx, email, password)
}
func (s *Service) Authenticate(ctx context.Context, token string) (managerauth.User, error) {
	return s.sessions.Authenticate(ctx, token)
}
func (s *Service) Logout(ctx context.Context, token string) error {
	return s.sessions.Logout(ctx, token)
}

// ChangePassword verifies the current credential and atomically revokes every
// session owned by this client account when the credential changes.
func (s *Service) ChangePassword(ctx context.Context, user managerauth.User, currentPassword, newPassword string) error {
	return s.sessions.ChangePassword(ctx, user, currentPassword, newPassword)
}

// DeleteAccount re-verifies the buyer's current credential before deleting
// the identity. Database foreign keys cascade owned sessions and buyer data.
func (s *Service) DeleteAccount(ctx context.Context, user managerauth.User, currentPassword, address string) error {
	if err := s.limit(ctx, strings.ToLower(strings.TrimSpace(user.Email)), address); err != nil {
		return err
	}
	verifiedUser, passwordHash, err := s.repository.FindUserByEmail(ctx, strings.ToLower(strings.TrimSpace(user.Email)))
	if err != nil || verifiedUser.ID != user.ID || managerauth.ComparePassword(passwordHash, currentPassword) != nil {
		return managerauth.ErrInvalidCredentials
	}
	deleted, err := s.repository.DeleteUser(ctx, user.ID, passwordHash)
	if err != nil {
		return err
	}
	if !deleted {
		return managerauth.ErrInvalidCredentials
	}
	return nil
}

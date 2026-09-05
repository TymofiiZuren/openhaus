package managerauth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidCredentials = errors.New("invalid credentials")
var ErrUnauthenticated = errors.New("unauthenticated")
var ErrInvalidPassword = errors.New("password must contain 12 to 72 bytes")
var ErrAccountSecurityUnavailable = errors.New("account security unavailable")

const dummyPasswordHash = "$2a$10$QPvBnroSxkXkd5Q5O15MpO.fmCkeEOIFPqfonQwdWd7EO8mDcpG0m"

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

type Session struct {
	Token     string
	User      User
	ExpiresAt time.Time
}

type Repository interface {
	FindUserByEmail(context.Context, string) (User, string, error)
	CreateSession(context.Context, string, []byte, time.Time) error
	FindSession(context.Context, []byte, time.Time) (User, time.Time, error)
	DeleteSession(context.Context, []byte) error
}

type AccountRepository interface {
	Repository
	ChangePasswordAndDeleteSessions(context.Context, string, string, string) error
	DeleteUserSessions(context.Context, string) error
}

type Service struct {
	repository Repository
	now        func() time.Time
	lifetime   time.Duration
}

func NewService(repository Repository) *Service {
	return &Service{repository: repository, now: time.Now, lifetime: 24 * time.Hour}
}

func (service *Service) Login(ctx context.Context, email, password string) (Session, error) {
	user, passwordHash, err := service.repository.FindUserByEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		passwordHash = dummyPasswordHash
	}
	passwordErr := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password))
	if err != nil || passwordErr != nil {
		return Session{}, ErrInvalidCredentials
	}
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return Session{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	expiresAt := service.now().Add(service.lifetime)
	if err := service.repository.CreateSession(ctx, user.ID, tokenDigest(token), expiresAt); err != nil {
		return Session{}, err
	}
	return Session{Token: token, User: user, ExpiresAt: expiresAt}, nil
}

func (service *Service) Authenticate(ctx context.Context, token string) (User, error) {
	if token == "" {
		return User{}, ErrUnauthenticated
	}
	user, _, err := service.repository.FindSession(ctx, tokenDigest(token), service.now())
	if err != nil {
		return User{}, ErrUnauthenticated
	}
	return user, nil
}

func (service *Service) Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	return service.repository.DeleteSession(ctx, tokenDigest(token))
}

func (service *Service) ChangePassword(ctx context.Context, user User, currentPassword, newPassword string) error {
	repository, ok := service.repository.(AccountRepository)
	if !ok {
		return ErrAccountSecurityUnavailable
	}
	verifiedUser, passwordHash, err := service.repository.FindUserByEmail(ctx, strings.ToLower(strings.TrimSpace(user.Email)))
	if err != nil || verifiedUser.ID != user.ID || bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(currentPassword)) != nil {
		return ErrInvalidCredentials
	}
	if len(newPassword) < 12 || len(newPassword) > 72 {
		return ErrInvalidPassword
	}
	newHash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	return repository.ChangePasswordAndDeleteSessions(ctx, user.ID, passwordHash, newHash)
}

func (service *Service) LogoutAll(ctx context.Context, userID string) error {
	repository, ok := service.repository.(AccountRepository)
	if !ok {
		return ErrAccountSecurityUnavailable
	}
	return repository.DeleteUserSessions(ctx, userID)
}

func HashPassword(password string) (string, error) {
	if len(password) < 12 || len(password) > 72 {
		return "", ErrInvalidPassword
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}

func tokenDigest(token string) []byte {
	digest := sha256.Sum256([]byte(token))
	return digest[:]
}

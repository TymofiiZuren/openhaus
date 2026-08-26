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

func HashPassword(password string) (string, error) {
	if len(password) < 12 {
		return "", errors.New("password must contain at least 12 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}

func tokenDigest(token string) []byte {
	digest := sha256.Sum256([]byte(token))
	return digest[:]
}

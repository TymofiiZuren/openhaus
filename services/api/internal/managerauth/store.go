package managerauth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type database interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

type Store struct{ database database }

func NewStore(database database) *Store { return &Store{database: database} }

func (store *Store) FindUserByEmail(ctx context.Context, email string) (User, string, error) {
	var user User
	var passwordHash string
	err := store.database.QueryRow(ctx, `SELECT id::text, email, password_hash FROM manager_users WHERE email = $1`, email).Scan(&user.ID, &user.Email, &passwordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, "", ErrInvalidCredentials
	}
	return user, passwordHash, err
}

func (store *Store) CreateSession(ctx context.Context, userID string, tokenHash []byte, expiresAt time.Time) error {
	_, err := store.database.Exec(ctx, `INSERT INTO manager_sessions (manager_user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, userID, tokenHash, expiresAt)
	return err
}

func (store *Store) FindSession(ctx context.Context, tokenHash []byte, now time.Time) (User, time.Time, error) {
	var user User
	var expiresAt time.Time
	err := store.database.QueryRow(ctx, `
		SELECT users.id::text, users.email, sessions.expires_at
		FROM manager_sessions AS sessions
		JOIN manager_users AS users ON users.id = sessions.manager_user_id
		WHERE sessions.token_hash = $1 AND sessions.expires_at > $2
	`, tokenHash, now).Scan(&user.ID, &user.Email, &expiresAt)
	return user, expiresAt, err
}

func (store *Store) DeleteSession(ctx context.Context, tokenHash []byte) error {
	_, err := store.database.Exec(ctx, `DELETE FROM manager_sessions WHERE token_hash = $1`, tokenHash)
	return err
}

func (store *Store) ChangePasswordAndDeleteSessions(ctx context.Context, userID, currentPasswordHash, newPasswordHash string) error {
	var updated bool
	err := store.database.QueryRow(ctx, `
		WITH updated AS (
			UPDATE manager_users SET password_hash = $3, updated_at = now()
			WHERE id = $1::uuid AND password_hash = $2
			RETURNING id
		), deleted AS (
			DELETE FROM manager_sessions
			WHERE manager_user_id IN (SELECT id FROM updated)
		)
		SELECT EXISTS (SELECT 1 FROM updated)
	`, userID, currentPasswordHash, newPasswordHash).Scan(&updated)
	if err != nil {
		return err
	}
	if !updated {
		return ErrUnauthenticated
	}
	return nil
}

func (store *Store) DeleteUserSessions(ctx context.Context, userID string) error {
	_, err := store.database.Exec(ctx, `DELETE FROM manager_sessions WHERE manager_user_id = $1::uuid`, userID)
	return err
}

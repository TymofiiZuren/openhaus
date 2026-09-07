package clientauth

import (
	"context"
	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"time"
)

type database interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}
type Store struct{ database database }

func NewStore(db database) *Store { return &Store{database: db} }
func (s *Store) CreateUser(ctx context.Context, email, hash string) error {
	_, err := s.database.Exec(ctx, `INSERT INTO client_users(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO NOTHING`, email, hash)
	return err
}
func (s *Store) FindUserByEmail(ctx context.Context, email string) (managerauth.User, string, error) {
	var user managerauth.User
	var hash string
	err := s.database.QueryRow(ctx, `SELECT id::text,email,password_hash FROM client_users WHERE email=$1`, email).Scan(&user.ID, &user.Email, &hash)
	return user, hash, err
}
func (s *Store) CreateSession(ctx context.Context, id string, digest []byte, expires time.Time) error {
	_, err := s.database.Exec(ctx, `INSERT INTO client_sessions(client_user_id,token_hash,expires_at) VALUES($1,$2,$3)`, id, digest, expires)
	return err
}
func (s *Store) FindSession(ctx context.Context, digest []byte, now time.Time) (managerauth.User, time.Time, error) {
	var user managerauth.User
	var expires time.Time
	err := s.database.QueryRow(ctx, `SELECT u.id::text,u.email,s.expires_at FROM client_sessions s JOIN client_users u ON u.id=s.client_user_id WHERE s.token_hash=$1 AND s.expires_at>$2`, digest, now).Scan(&user.ID, &user.Email, &expires)
	return user, expires, err
}
func (s *Store) DeleteSession(ctx context.Context, digest []byte) error {
	_, err := s.database.Exec(ctx, `DELETE FROM client_sessions WHERE token_hash=$1`, digest)
	return err
}
func (s *Store) ChangePasswordAndDeleteSessions(ctx context.Context, userID, currentPasswordHash, newPasswordHash string) error {
	var updated bool
	err := s.database.QueryRow(ctx, `
		WITH updated AS (
			UPDATE client_users SET password_hash = $3
			WHERE id = $1::uuid AND password_hash = $2
			RETURNING id
		), deleted AS (
			DELETE FROM client_sessions
			WHERE client_user_id IN (SELECT id FROM updated)
		)
		SELECT EXISTS (SELECT 1 FROM updated)
	`, userID, currentPasswordHash, newPasswordHash).Scan(&updated)
	if err != nil {
		return err
	}
	if !updated {
		return managerauth.ErrUnauthenticated
	}
	return nil
}
func (s *Store) DeleteUserSessions(ctx context.Context, userID string) error {
	_, err := s.database.Exec(ctx, `DELETE FROM client_sessions WHERE client_user_id = $1::uuid`, userID)
	return err
}
func (s *Store) DeleteUser(ctx context.Context, userID, passwordHash string) (bool, error) {
	result, err := s.database.Exec(ctx, `DELETE FROM client_users WHERE id = $1::uuid AND password_hash = $2`, userID, passwordHash)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() == 1, nil
}
func (s *Store) AllowAttempt(ctx context.Context, digest []byte, now time.Time, maximum int) (bool, error) {
	var attempts int
	err := s.database.QueryRow(ctx, `INSERT INTO client_auth_limits(key_hash,attempts,reset_at) VALUES($1,1,$2)
 ON CONFLICT(key_hash) DO UPDATE SET
 attempts=CASE WHEN client_auth_limits.reset_at<=$3 THEN 1 ELSE LEAST(client_auth_limits.attempts+1,1000) END,
 reset_at=CASE WHEN client_auth_limits.reset_at<=$3 THEN $2 ELSE client_auth_limits.reset_at END
 RETURNING attempts`, digest, now.Add(15*time.Minute), now).Scan(&attempts)
	return attempts <= maximum, err
}

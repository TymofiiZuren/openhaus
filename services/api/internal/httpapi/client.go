package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/clientauth"
	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
)

type ClientAuthenticator interface {
	Register(context.Context, string, string, string) error
	Login(context.Context, string, string, string) (managerauth.Session, error)
	Authenticate(context.Context, string) (managerauth.User, error)
	Logout(context.Context, string) error
}

const clientCookie = "openhaus_client_session"

func clientRoutes(router *http.ServeMux, auth ClientAuthenticator, saved ClientSavedPropertyStore, origin string, secure bool) {
	guard := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			if r.Method != "GET" && (origin == "" || r.Header.Get("Origin") != origin || r.Header.Get("Sec-Fetch-Site") == "cross-site") {
				writeError(w, 403, "invalid_origin", "same-origin request required")
				return
			}
			next(w, r)
		}
	}
	credentials := func(register bool) http.HandlerFunc {
		return guard(func(w http.ResponseWriter, r *http.Request) {
			contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || contentType != "application/json" {
				writeError(w, 415, "invalid_content_type", "JSON required")
				return
			}
			var input struct {
				Email    string `json:"email"`
				Password string `json:"password"`
			}
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil || decoder.Decode(new(any)) != io.EOF || len(input.Email) > 320 || len(input.Password) > 72 || input.Email == "" || input.Password == "" {
				writeError(w, 400, "invalid_request", "valid email and password required")
				return
			}
			// Do not trust client-supplied forwarding headers for rate limiting.
			address, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				address = r.RemoteAddr
			}
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()
			if register {
				if err := auth.Register(ctx, input.Email, input.Password, address); err != nil {
					clientError(w, err)
					return
				}
				writeJSON(w, http.StatusAccepted, map[string]string{"message": "Registration processed. Sign in with your existing or newly created development account."})
				return
			}
			session, err := auth.Login(ctx, input.Email, input.Password, address)
			if err != nil {
				clientError(w, err)
				return
			}
			http.SetCookie(w, &http.Cookie{Name: clientCookie, Value: session.Token, Path: "/api/v1/client", HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode, Expires: session.ExpiresAt})
			writeJSON(w, 200, map[string]any{"client": session.User})
		})
	}
	router.HandleFunc("POST /api/v1/client/accounts", credentials(true))
	router.HandleFunc("POST /api/v1/client/session", credentials(false))
	router.HandleFunc("GET /api/v1/client/session", guard(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(clientCookie)
		if err != nil {
			clientError(w, managerauth.ErrUnauthenticated)
			return
		}
		user, err := auth.Authenticate(r.Context(), cookie.Value)
		if err != nil {
			clientError(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"client": user})
	}))
	router.HandleFunc("DELETE /api/v1/client/session", guard(func(w http.ResponseWriter, r *http.Request) {
		if cookie, err := r.Cookie(clientCookie); err == nil {
			if err = auth.Logout(r.Context(), cookie.Value); err != nil {
				clientError(w, err)
				return
			}
		}
		http.SetCookie(w, &http.Cookie{Name: clientCookie, Path: "/api/v1/client", HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode, MaxAge: -1, Expires: time.Unix(0, 0)})
		w.WriteHeader(http.StatusNoContent)
	}))
	if saved != nil {
		authenticated := func(next func(http.ResponseWriter, *http.Request, managerauth.User)) http.HandlerFunc {
			return guard(func(w http.ResponseWriter, r *http.Request) {
				cookie, err := r.Cookie(clientCookie)
				if err != nil {
					clientError(w, managerauth.ErrUnauthenticated)
					return
				}
				ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
				defer cancel()
				user, err := auth.Authenticate(ctx, cookie.Value)
				if err != nil {
					clientError(w, err)
					return
				}
				next(w, r.WithContext(ctx), user)
			})
		}
		router.HandleFunc("GET /api/v1/client/saved-properties", authenticated(func(w http.ResponseWriter, r *http.Request, user managerauth.User) {
			items, err := saved.ListClientSaved(r.Context(), user.ID)
			if err != nil {
				clientError(w, err)
				return
			}
			if items == nil {
				items = []property.Property{}
			}
			writeJSON(w, http.StatusOK, map[string]any{"properties": items})
		}))
		router.HandleFunc("PUT /api/v1/client/saved-properties/{propertyID}", authenticated(func(w http.ResponseWriter, r *http.Request, user managerauth.User) {
			propertyID := r.PathValue("propertyID")
			if !validUUID(propertyID) {
				writeError(w, 400, "invalid_property", "valid property id required")
				return
			}
			if err := saved.SaveClientProperty(r.Context(), user.ID, propertyID); errors.Is(err, property.ErrNotFound) {
				writeError(w, 404, "not_found", "published property not found")
			} else if err != nil {
				clientError(w, err)
			} else {
				w.WriteHeader(http.StatusNoContent)
			}
		}))
		router.HandleFunc("DELETE /api/v1/client/saved-properties/{propertyID}", authenticated(func(w http.ResponseWriter, r *http.Request, user managerauth.User) {
			propertyID := r.PathValue("propertyID")
			if !validUUID(propertyID) {
				writeError(w, 400, "invalid_property", "valid property id required")
				return
			}
			if err := saved.RemoveClientSavedProperty(r.Context(), user.ID, propertyID); err != nil {
				clientError(w, err)
			} else {
				w.WriteHeader(http.StatusNoContent)
			}
		}))
	}
}

func validUUID(value string) bool {
	if len(value) != 36 || value[8] != '-' || value[13] != '-' || value[18] != '-' || value[23] != '-' {
		return false
	}
	for index, character := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			continue
		}
		if !strings.ContainsRune("0123456789abcdefABCDEF", character) {
			return false
		}
	}
	return true
}

func clientError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, clientauth.ErrRateLimited):
		w.Header().Set("Retry-After", "900")
		writeError(w, 429, "too_many_attempts", "try again later")
	case errors.Is(err, clientauth.ErrInvalidInput):
		writeError(w, 400, "invalid_registration", "use a valid email and a password of 12 to 72 bytes")
	case errors.Is(err, managerauth.ErrInvalidCredentials), errors.Is(err, managerauth.ErrUnauthenticated):
		writeError(w, 401, "authentication_required", "email or password is incorrect, or the session has expired")
	default:
		writeError(w, 503, "unavailable", "account service is temporarily unavailable")
	}
}

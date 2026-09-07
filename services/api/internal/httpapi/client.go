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
	"unicode/utf8"

	"github.com/TymofiiZuren/openhaus/services/api/internal/clientauth"
	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
)

type ClientAuthenticator interface {
	Register(context.Context, string, string, string) error
	Login(context.Context, string, string, string) (managerauth.Session, error)
	Authenticate(context.Context, string) (managerauth.User, error)
	Logout(context.Context, string) error
	ChangePassword(context.Context, managerauth.User, string, string) error
	DeleteAccount(context.Context, managerauth.User, string, string) error
}

const clientCookie = "openhaus_client_session"

func clientRoutes(router *http.ServeMux, auth ClientAuthenticator, saved ClientSavedPropertyStore, notes ClientPropertyNoteStore, searches ClientSavedSearchStore, exporter ClientDataExporter, origin string, secure bool) {
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
	router.HandleFunc("PUT /api/v1/client/password", authenticated(func(w http.ResponseWriter, r *http.Request, user managerauth.User) {
		contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || contentType != "application/json" {
			writeError(w, http.StatusUnsupportedMediaType, "invalid_content_type", "JSON required")
			return
		}
		var input struct {
			CurrentPassword string `json:"currentPassword"`
			NewPassword     string `json:"newPassword"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil || decoder.Decode(new(any)) != io.EOF || input.CurrentPassword == "" || input.NewPassword == "" || len(input.CurrentPassword) > 72 || len(input.NewPassword) > 72 {
			writeError(w, http.StatusBadRequest, "invalid_request", "current and new passwords are required")
			return
		}
		if err := auth.ChangePassword(r.Context(), user, input.CurrentPassword, input.NewPassword); err != nil {
			clientError(w, err)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: clientCookie, Path: "/api/v1/client", HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode, MaxAge: -1, Expires: time.Unix(0, 0)})
		w.WriteHeader(http.StatusNoContent)
	}))
	router.HandleFunc("DELETE /api/v1/client/account", authenticated(func(w http.ResponseWriter, r *http.Request, user managerauth.User) {
		contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || contentType != "application/json" {
			writeError(w, http.StatusUnsupportedMediaType, "invalid_content_type", "JSON required")
			return
		}
		var input struct {
			CurrentPassword string `json:"currentPassword"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil || decoder.Decode(new(any)) != io.EOF || input.CurrentPassword == "" || len(input.CurrentPassword) > 72 {
			writeError(w, http.StatusBadRequest, "invalid_request", "current password is required")
			return
		}
		address, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			address = r.RemoteAddr
		}
		if err := auth.DeleteAccount(r.Context(), user, input.CurrentPassword, address); err != nil {
			clientError(w, err)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: clientCookie, Path: "/api/v1/client", HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode, MaxAge: -1, Expires: time.Unix(0, 0)})
		w.WriteHeader(http.StatusNoContent)
	}))
	if saved != nil {
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
	if notes != nil {
		router.HandleFunc("GET /api/v1/client/property-notes/{propertyID}", authenticated(func(w http.ResponseWriter, r *http.Request, user managerauth.User) {
			propertyID := r.PathValue("propertyID")
			if !validUUID(propertyID) {
				writeError(w, http.StatusBadRequest, "invalid_property", "valid property id required")
				return
			}
			note, err := notes.GetClientPropertyNote(r.Context(), user.ID, propertyID)
			if errors.Is(err, property.ErrNotFound) {
				writeError(w, http.StatusNotFound, "not_found", "published property not found")
				return
			}
			if err != nil {
				clientError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"note": note})
		}))
		router.HandleFunc("PUT /api/v1/client/property-notes/{propertyID}", authenticated(func(w http.ResponseWriter, r *http.Request, user managerauth.User) {
			propertyID := r.PathValue("propertyID")
			if !validUUID(propertyID) {
				writeError(w, http.StatusBadRequest, "invalid_property", "valid property id required")
				return
			}
			contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || contentType != "application/json" {
				writeError(w, http.StatusUnsupportedMediaType, "invalid_content_type", "JSON required")
				return
			}
			var input struct {
				Notes     string   `json:"notes"`
				Questions []string `json:"questions"`
			}
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil || decoder.Decode(new(any)) != io.EOF || utf8.RuneCountInString(input.Notes) > 4000 || len(input.Questions) > 8 || invalidQuestions(input.Questions) {
				writeError(w, http.StatusBadRequest, "invalid_note", "notes must be at most 4000 characters with up to 8 short questions")
				return
			}
			if input.Questions == nil {
				input.Questions = []string{}
			}
			note, err := notes.UpsertClientPropertyNote(r.Context(), user.ID, propertyID, property.ClientPropertyNote{PropertyID: propertyID, Notes: input.Notes, Questions: input.Questions})
			if errors.Is(err, property.ErrNotFound) {
				writeError(w, http.StatusNotFound, "not_found", "published property not found")
				return
			}
			if err != nil {
				clientError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"note": note})
		}))
	}
	if searches != nil {
		router.HandleFunc("GET /api/v1/client/saved-searches", authenticated(func(w http.ResponseWriter, r *http.Request, user managerauth.User) {
			items, err := searches.ListClientSavedSearches(r.Context(), user.ID)
			if err != nil {
				clientError(w, err)
				return
			}
			if items == nil {
				items = []property.ClientSavedSearch{}
			}
			writeJSON(w, http.StatusOK, map[string]any{"searches": items})
		}))
		router.HandleFunc("POST /api/v1/client/saved-searches", authenticated(func(w http.ResponseWriter, r *http.Request, user managerauth.User) {
			contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || contentType != "application/json" {
				writeError(w, http.StatusUnsupportedMediaType, "invalid_content_type", "JSON required")
				return
			}
			var input struct {
				Location        string `json:"location"`
				County          string `json:"county"`
				Area            string `json:"area"`
				Query           string `json:"query"`
				MinimumBedrooms int16  `json:"minimumBedrooms"`
				PropertyType    string `json:"propertyType"`
				MaximumPrice    int64  `json:"maximumPrice"`
				SpatialOnly     bool   `json:"spatialOnly"`
				Frequency       string `json:"frequency"`
			}
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil || decoder.Decode(new(any)) != io.EOF {
				writeError(w, http.StatusBadRequest, "invalid_saved_search", "valid search filters and alert frequency required")
				return
			}
			item := property.ClientSavedSearch{Location: strings.TrimSpace(input.Location), County: strings.TrimSpace(input.County), Area: strings.TrimSpace(input.Area), Query: strings.TrimSpace(input.Query), MinimumBedrooms: input.MinimumBedrooms, PropertyType: strings.TrimSpace(input.PropertyType), MaximumPrice: input.MaximumPrice, SpatialOnly: input.SpatialOnly, Frequency: input.Frequency}
			if !validSavedSearch(item) {
				writeError(w, http.StatusBadRequest, "invalid_saved_search", "valid search filters and alert frequency required")
				return
			}
			created, err := searches.CreateClientSavedSearch(r.Context(), user.ID, item)
			if errors.Is(err, property.ErrSavedSearchLimit) {
				writeError(w, http.StatusConflict, "saved_search_limit", "remove an existing saved search before adding another")
				return
			}
			if err != nil {
				clientError(w, err)
				return
			}
			writeJSON(w, http.StatusCreated, map[string]any{"search": created})
		}))
		router.HandleFunc("DELETE /api/v1/client/saved-searches/{searchID}", authenticated(func(w http.ResponseWriter, r *http.Request, user managerauth.User) {
			searchID := r.PathValue("searchID")
			if !validUUID(searchID) {
				writeError(w, http.StatusBadRequest, "invalid_search", "valid search id required")
				return
			}
			if err := searches.RemoveClientSavedSearch(r.Context(), user.ID, searchID); err != nil {
				clientError(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		}))
	}
	if exporter != nil {
		router.HandleFunc("GET /api/v1/client/export", authenticated(func(w http.ResponseWriter, r *http.Request, user managerauth.User) {
			data, err := exporter.ExportClientData(r.Context(), user.ID)
			if err != nil {
				clientError(w, err)
				return
			}
			w.Header().Set("Content-Disposition", `attachment; filename="openhaus-account-data.json"`)
			writeJSON(w, http.StatusOK, map[string]any{
				"exportedAt":       time.Now().UTC(),
				"account":          map[string]string{"id": user.ID, "email": user.Email},
				"savedPropertyIds": data.SavedPropertyIDs,
				"savedSearches":    data.SavedSearches,
				"propertyNotes":    data.PropertyNotes,
			})
		}))
	}
}

func validSavedSearch(input property.ClientSavedSearch) bool {
	location := strings.TrimSpace(input.Location)
	county := strings.TrimSpace(input.County)
	area := strings.TrimSpace(input.Area)
	query := strings.TrimSpace(input.Query)
	validFrequency := input.Frequency == "instant" || input.Frequency == "daily" || input.Frequency == "weekly"
	validPropertyType := input.PropertyType == "all" || input.PropertyType == "detached" || input.PropertyType == "semi_detached" || input.PropertyType == "terraced" || input.PropertyType == "apartment"
	return location != "" && utf8.RuneCountInString(location) <= 160 && utf8.RuneCountInString(county) <= 80 &&
		utf8.RuneCountInString(area) <= 120 && utf8.RuneCountInString(query) <= 160 && input.MinimumBedrooms >= 0 &&
		input.MinimumBedrooms <= 20 && validPropertyType && input.MaximumPrice >= 0 && input.MaximumPrice <= 100_000_000_000 && validFrequency
}

func invalidQuestions(questions []string) bool {
	seen := make(map[string]struct{}, len(questions))
	for _, question := range questions {
		if question == "" || utf8.RuneCountInString(question) > 160 {
			return true
		}
		if _, exists := seen[question]; exists {
			return true
		}
		seen[question] = struct{}{}
	}
	return false
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
	case errors.Is(err, managerauth.ErrInvalidPassword):
		writeError(w, 400, "invalid_password", "use a password of 12 to 72 bytes")
	case errors.Is(err, managerauth.ErrInvalidCredentials), errors.Is(err, managerauth.ErrUnauthenticated):
		writeError(w, 401, "authentication_required", "email or password is incorrect, or the session has expired")
	default:
		writeError(w, 503, "unavailable", "account service is temporarily unavailable")
	}
}

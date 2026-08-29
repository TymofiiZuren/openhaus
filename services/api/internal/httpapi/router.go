package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
)

const dependencyTimeout = 2 * time.Second
const maxVideoUploadBytes int64 = 2 << 30

// ReadinessChecker reports whether a required dependency is reachable.
type ReadinessChecker interface {
	Ping(context.Context) error
}

// PropertyLister returns homes that are visible in the public catalogue.
type PropertyLister interface {
	ListPublished(context.Context, *property.Bounds) ([]property.Property, error)
}

type ManagerPropertyLister interface {
	ListManaged(context.Context) ([]property.ManagedProperty, error)
}

type ManagerPropertyWriter interface {
	CreateManaged(context.Context, property.ManagedPropertyInput) (property.ManagedProperty, error)
	UpdateManaged(context.Context, string, property.ManagedPropertyInput) (property.ManagedProperty, error)
}

type ManagerAuthenticator interface {
	Login(context.Context, string, string) (managerauth.Session, error)
	Authenticate(context.Context, string) (managerauth.User, error)
	Logout(context.Context, string) error
}

type VideoUploader interface {
	AcceptUpload(context.Context, string, string, io.Reader) (mediajob.Job, error)
}

type MediaJobGetter interface {
	Get(context.Context, string) (mediajob.Job, error)
}

// Dependencies contains the external services used by the HTTP API.
type Dependencies struct {
	Readiness             ReadinessChecker
	Properties            PropertyLister
	Videos                VideoUploader
	Jobs                  MediaJobGetter
	ManagerAuth           ManagerAuthenticator
	ManagerProperties     ManagerPropertyLister
	ManagerPropertyWriter ManagerPropertyWriter
	SecureCookies         bool
}

// NewRouter builds the API's HTTP routing table.
func NewRouter(dependencies Dependencies) http.Handler {
	router := http.NewServeMux()
	router.HandleFunc("GET /healthz", health)
	router.HandleFunc("GET /readyz", ready(dependencies.Readiness))
	router.HandleFunc("GET /api/v1/properties", listProperties(dependencies.Properties))
	router.Handle("POST /api/v1/manager/properties/{propertyID}/videos", requireManager(dependencies.ManagerAuth, uploadVideo(dependencies.Videos)))
	router.Handle("GET /api/v1/manager/media-jobs/{jobID}", requireManager(dependencies.ManagerAuth, getMediaJob(dependencies.Jobs)))
	router.HandleFunc("POST /api/v1/manager/session", managerLogin(dependencies.ManagerAuth, dependencies.SecureCookies))
	router.HandleFunc("DELETE /api/v1/manager/session", managerLogout(dependencies.ManagerAuth, dependencies.SecureCookies))
	router.Handle("GET /api/v1/manager/properties", requireManager(dependencies.ManagerAuth, listManagedProperties(dependencies.ManagerProperties)))
	router.Handle("POST /api/v1/manager/properties", requireManager(dependencies.ManagerAuth, createManagedProperty(dependencies.ManagerPropertyWriter)))
	router.Handle("PUT /api/v1/manager/properties/{propertyID}", requireManager(dependencies.ManagerAuth, updateManagedProperty(dependencies.ManagerPropertyWriter)))
	return router
}

func createManagedProperty(properties ManagerPropertyWriter) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		input, ok := decodeManagedProperty(response, request)
		if !ok {
			return
		}
		input.Status = "draft"
		item, err := properties.CreateManaged(request.Context(), input)
		if err != nil {
			log.Printf("create manager property: %v", err)
			writeError(response, http.StatusInternalServerError, "internal_error", "internal server error")
			return
		}
		writeJSON(response, http.StatusCreated, item)
	}
}

func updateManagedProperty(properties ManagerPropertyWriter) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		input, ok := decodeManagedProperty(response, request)
		if !ok {
			return
		}
		item, err := properties.UpdateManaged(request.Context(), request.PathValue("propertyID"), input)
		if errors.Is(err, property.ErrNotFound) {
			writeError(response, http.StatusNotFound, "not_found", "property not found")
			return
		}
		if err != nil {
			log.Printf("update manager property: %v", err)
			writeError(response, http.StatusInternalServerError, "internal_error", "internal server error")
			return
		}
		writeJSON(response, http.StatusOK, item)
	}
}

func decodeManagedProperty(response http.ResponseWriter, request *http.Request) (property.ManagedPropertyInput, bool) {
	var input property.ManagedPropertyInput
	decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 32<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil || !validManagedProperty(input) {
		writeError(response, http.StatusBadRequest, "invalid_property", "complete valid property details are required")
		return property.ManagedPropertyInput{}, false
	}
	input.Title = strings.TrimSpace(input.Title)
	input.AddressLine1 = strings.TrimSpace(input.AddressLine1)
	input.City = strings.TrimSpace(input.City)
	input.County = strings.TrimSpace(input.County)
	return input, true
}

func validManagedProperty(input property.ManagedPropertyInput) bool {
	validType := input.PropertyType == "detached" || input.PropertyType == "semi_detached" || input.PropertyType == "terraced" || input.PropertyType == "apartment"
	validStatus := input.Status == "" || input.Status == "draft" || input.Status == "published" || input.Status == "archived"
	return strings.TrimSpace(input.Title) != "" && strings.TrimSpace(input.AddressLine1) != "" &&
		strings.TrimSpace(input.City) != "" && strings.TrimSpace(input.County) != "" && input.PriceCents > 0 &&
		input.Bedrooms >= 0 && input.Bedrooms <= 20 && validType && validStatus &&
		input.Longitude >= -180 && input.Longitude <= 180 && input.Latitude >= -90 && input.Latitude <= 90
}

const managerSessionCookie = "openhaus_manager_session"

func managerLogin(authenticator ManagerAuthenticator, secure bool) http.HandlerFunc {
	type credentials struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	return func(response http.ResponseWriter, request *http.Request) {
		var input credentials
		decoder := json.NewDecoder(http.MaxBytesReader(response, request.Body, 16<<10))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil || input.Email == "" || input.Password == "" {
			writeError(response, http.StatusBadRequest, "invalid_request", "email and password are required")
			return
		}
		session, err := authenticator.Login(request.Context(), input.Email, input.Password)
		if errors.Is(err, managerauth.ErrInvalidCredentials) {
			writeError(response, http.StatusUnauthorized, "invalid_credentials", "email or password is incorrect")
			return
		}
		if err != nil {
			log.Printf("manager login: %v", err)
			writeError(response, http.StatusInternalServerError, "internal_error", "internal server error")
			return
		}
		setManagerCookie(response, session.Token, session.ExpiresAt, secure)
		writeJSON(response, http.StatusOK, map[string]any{"manager": session.User})
	}
}

func managerLogout(authenticator ManagerAuthenticator, secure bool) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		cookie, _ := request.Cookie(managerSessionCookie)
		if cookie != nil {
			if err := authenticator.Logout(request.Context(), cookie.Value); err != nil {
				log.Printf("manager logout: %v", err)
				writeError(response, http.StatusInternalServerError, "internal_error", "internal server error")
				return
			}
		}
		setManagerCookie(response, "", time.Unix(0, 0), secure)
		response.WriteHeader(http.StatusNoContent)
	}
}

func requireManager(authenticator ManagerAuthenticator, next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		cookie, err := request.Cookie(managerSessionCookie)
		if err != nil {
			writeError(response, http.StatusUnauthorized, "authentication_required", "manager authentication is required")
			return
		}
		if _, err := authenticator.Authenticate(request.Context(), cookie.Value); err != nil {
			writeError(response, http.StatusUnauthorized, "authentication_required", "manager authentication is required")
			return
		}
		next.ServeHTTP(response, request)
	})
}

func listManagedProperties(properties ManagerPropertyLister) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		items, err := properties.ListManaged(request.Context())
		if err != nil {
			log.Printf("list manager properties: %v", err)
			writeError(response, http.StatusInternalServerError, "internal_error", "internal server error")
			return
		}
		writeJSON(response, http.StatusOK, map[string]any{"properties": items})
	}
}

func setManagerCookie(response http.ResponseWriter, token string, expires time.Time, secure bool) {
	maxAge := int(time.Until(expires).Seconds())
	if token == "" {
		maxAge = -1
	}
	http.SetCookie(response, &http.Cookie{Name: managerSessionCookie, Value: token, Path: "/api/v1/manager", Expires: expires,
		MaxAge: maxAge, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode})
}

func uploadVideo(uploader VideoUploader) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		request.Body = http.MaxBytesReader(response, request.Body, maxVideoUploadBytes)
		reader, err := request.MultipartReader()
		if err != nil {
			writeError(response, http.StatusBadRequest, "invalid_multipart", "a multipart video upload is required")
			return
		}
		for {
			part, nextErr := reader.NextPart()
			if errors.Is(nextErr, io.EOF) {
				break
			}
			if nextErr != nil {
				writeError(response, http.StatusBadRequest, "invalid_multipart", "could not read multipart upload")
				return
			}
			if part.FormName() != "video" || part.FileName() == "" {
				_ = part.Close()
				continue
			}
			job, uploadErr := uploader.AcceptUpload(request.Context(), request.PathValue("propertyID"), part.FileName(), part)
			_ = part.Close()
			var maxBytesError *http.MaxBytesError
			if errors.As(uploadErr, &maxBytesError) {
				writeError(response, http.StatusRequestEntityTooLarge, "video_too_large", "video exceeds the 2 GiB upload limit")
				return
			}
			if errors.Is(uploadErr, mediajob.ErrUnsupportedMedia) {
				writeError(response, http.StatusUnsupportedMediaType, "unsupported_media", "only MP4 and MOV videos are supported")
				return
			}
			if uploadErr != nil {
				log.Printf("accept video upload: %v", uploadErr)
				writeError(response, http.StatusInternalServerError, "internal_error", "internal server error")
				return
			}
			writeJSON(response, http.StatusAccepted, job)
			return
		}
		writeError(response, http.StatusBadRequest, "video_required", "multipart field video is required")
	}
}

func getMediaJob(jobs MediaJobGetter) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), dependencyTimeout)
		defer cancel()
		job, err := jobs.Get(ctx, request.PathValue("jobID"))
		if errors.Is(err, mediajob.ErrNotFound) {
			writeError(response, http.StatusNotFound, "not_found", "media job not found")
			return
		}
		if err != nil {
			log.Printf("get media job: %v", err)
			writeError(response, http.StatusInternalServerError, "internal_error", "internal server error")
			return
		}
		writeJSON(response, http.StatusOK, job)
	}
}

func writeError(response http.ResponseWriter, status int, code, message string) {
	writeJSON(response, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func health(response http.ResponseWriter, _ *http.Request) {
	writeJSON(response, http.StatusOK, map[string]string{"status": "ok"})
}

func ready(checker ReadinessChecker) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), dependencyTimeout)
		defer cancel()

		if err := checker.Ping(ctx); err != nil {
			writeJSON(response, http.StatusServiceUnavailable, map[string]string{
				"status": "not_ready",
			})
			return
		}

		writeJSON(response, http.StatusOK, map[string]string{"status": "ready"})
	}
}

func listProperties(properties PropertyLister) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		bounds, err := parseBounds(request.URL.Query().Get("bbox"))
		if err != nil {
			writeError(response, http.StatusBadRequest, "invalid_bbox", "bbox must be west,south,east,north coordinates")
			return
		}
		ctx, cancel := context.WithTimeout(request.Context(), dependencyTimeout)
		defer cancel()

		items, err := properties.ListPublished(ctx, bounds)
		if err != nil {
			log.Printf("list published properties: %v", err)
			writeJSON(response, http.StatusInternalServerError, map[string]any{
				"error": map[string]string{
					"code":    "internal_error",
					"message": "internal server error",
				},
			})
			return
		}

		if items == nil {
			items = []property.Property{}
		}
		writeJSON(response, http.StatusOK, map[string]any{"properties": items})
	}
}

func parseBounds(value string) (*property.Bounds, error) {
	if value == "" {
		return nil, nil
	}
	parts := strings.Split(value, ",")
	if len(parts) != 4 {
		return nil, errors.New("bbox must contain four coordinates")
	}
	coordinates := make([]float64, 4)
	for index, part := range parts {
		coordinate, err := strconv.ParseFloat(strings.TrimSpace(part), 64)
		if err != nil || math.IsNaN(coordinate) || math.IsInf(coordinate, 0) {
			return nil, errors.New("bbox contains an invalid coordinate")
		}
		coordinates[index] = coordinate
	}
	bounds := &property.Bounds{
		West: coordinates[0], South: coordinates[1], East: coordinates[2], North: coordinates[3],
	}
	if bounds.West < -180 || bounds.East > 180 || bounds.South < -90 || bounds.North > 90 ||
		bounds.West >= bounds.East || bounds.South >= bounds.North {
		return nil, errors.New("bbox coordinates are outside WGS84 or reversed")
	}
	return bounds, nil
}

func writeJSON(response http.ResponseWriter, status int, body any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	if err := json.NewEncoder(response).Encode(body); err != nil {
		log.Printf("encode JSON response: %v", err)
	}
}

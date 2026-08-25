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

type VideoUploader interface {
	AcceptUpload(context.Context, string, string, io.Reader) (mediajob.Job, error)
}

type MediaJobGetter interface {
	Get(context.Context, string) (mediajob.Job, error)
}

// Dependencies contains the external services used by the HTTP API.
type Dependencies struct {
	Readiness  ReadinessChecker
	Properties PropertyLister
	Videos     VideoUploader
	Jobs       MediaJobGetter
}

// NewRouter builds the API's HTTP routing table.
func NewRouter(dependencies Dependencies) http.Handler {
	router := http.NewServeMux()
	router.HandleFunc("GET /healthz", health)
	router.HandleFunc("GET /readyz", ready(dependencies.Readiness))
	router.HandleFunc("GET /api/v1/properties", listProperties(dependencies.Properties))
	router.HandleFunc("POST /api/v1/properties/{propertyID}/videos", uploadVideo(dependencies.Videos))
	router.HandleFunc("GET /api/v1/media-jobs/{jobID}", getMediaJob(dependencies.Jobs))
	return router
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

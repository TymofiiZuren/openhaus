package httpapi

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
)

const dependencyTimeout = 2 * time.Second

// ReadinessChecker reports whether a required dependency is reachable.
type ReadinessChecker interface {
	Ping(context.Context) error
}

// PropertyLister returns homes that are visible in the public catalogue.
type PropertyLister interface {
	ListPublished(context.Context) ([]property.Property, error)
}

// Dependencies contains the external services used by the HTTP API.
type Dependencies struct {
	Readiness  ReadinessChecker
	Properties PropertyLister
}

// NewRouter builds the API's HTTP routing table.
func NewRouter(dependencies Dependencies) http.Handler {
	router := http.NewServeMux()
	router.HandleFunc("GET /healthz", health)
	router.HandleFunc("GET /readyz", ready(dependencies.Readiness))
	router.HandleFunc("GET /api/v1/properties", listProperties(dependencies.Properties))
	return router
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
		ctx, cancel := context.WithTimeout(request.Context(), dependencyTimeout)
		defer cancel()

		items, err := properties.ListPublished(ctx)
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

func writeJSON(response http.ResponseWriter, status int, body any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	if err := json.NewEncoder(response).Encode(body); err != nil {
		log.Printf("encode JSON response: %v", err)
	}
}

package httpapi

import (
	"encoding/json"
	"net/http"
)

// NewRouter builds the API's HTTP routing table.
func NewRouter() http.Handler {
	router := http.NewServeMux()
	router.HandleFunc("GET /healthz", health)
	return router
}

func health(response http.ResponseWriter, _ *http.Request) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(response).Encode(map[string]string{"status": "ok"})
}

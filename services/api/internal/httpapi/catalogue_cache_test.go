package httpapi_test

import (
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/TymofiiZuren/openhaus/services/api/internal/httpapi"
	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
)

func TestCatalogueRevalidatesBeforeReturningNotModified(t *testing.T) {
	store := &propertyListerStub{properties: []property.Property{{ID: "home", Title: "Before"}}}
	router := httpapi.NewRouter(httpapi.Dependencies{Readiness: readinessStub{}, Properties: store})
	get := func(method, tag string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/v1/properties", nil)
		r.Header.Set("If-None-Match", tag)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	first := get("GET", "")
	tag := first.Header().Get("ETag")
	if tag == "" {
		t.Fatal("missing ETag")
	}
	for _, condition := range []string{tag, "W/" + tag, "\"different\", " + tag, "*"} {
		response := get("GET", condition)
		if response.Code != 304 || response.Body.Len() != 0 || response.Header().Get("Cache-Control") != "private, no-cache" {
			t.Fatalf("conditional GET = %d %q", response.Code, response.Body.String())
		}
	}
	store.properties[0].Title = "After"
	changed := get("GET", tag)
	if changed.Code != 200 || changed.Header().Get("ETag") == tag {
		t.Fatal("changed listing served stale")
	}
	if response := get("HEAD", changed.Header().Get("ETag")); response.Code != 304 || response.Body.Len() != 0 {
		t.Fatal("conditional HEAD failed")
	}
	store.err = errors.New("offline")
	failed := get("GET", changed.Header().Get("ETag"))
	if failed.Code != 500 || failed.Header().Get("ETag") != "" || failed.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("failure cached or mistaken for unchanged")
	}
}

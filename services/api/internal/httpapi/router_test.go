package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/TymofiiZuren/openhaus/services/api/internal/httpapi"
	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
)

type readinessStub struct {
	err error
}

func (stub readinessStub) Ping(context.Context) error {
	return stub.err
}

type propertyListerStub struct {
	properties []property.Property
	err        error
	bounds     *property.Bounds
}

func (stub *propertyListerStub) ListPublished(_ context.Context, bounds *property.Bounds) ([]property.Property, error) {
	stub.bounds = bounds
	return stub.properties, stub.err
}

func newRouter() http.Handler {
	return httpapi.NewRouter(httpapi.Dependencies{
		Readiness: readinessStub{},
		Properties: &propertyListerStub{
			properties: []property.Property{},
		},
	})
}

func TestHealth(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()

	newRouter().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}

	if contentType := response.Header().Get("Content-Type"); contentType != "application/json" {
		t.Fatalf("Content-Type = %q, want %q", contentType, "application/json")
	}

	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Status != "ok" {
		t.Fatalf("status body = %q, want %q", body.Status, "ok")
	}
}

func TestHealthRejectsUnsupportedMethod(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/healthz", nil)
	response := httptest.NewRecorder()

	newRouter().ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusMethodNotAllowed)
	}
}

func TestUnknownRoute(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/missing", nil)
	response := httptest.NewRecorder()

	newRouter().ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

func TestReady(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	response := httptest.NewRecorder()
	router := httpapi.NewRouter(httpapi.Dependencies{
		Readiness:  readinessStub{},
		Properties: &propertyListerStub{},
	})

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	assertJSONStatus(t, response, "ready")
}

func TestReadyWhenDatabaseIsUnavailable(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	response := httptest.NewRecorder()
	router := httpapi.NewRouter(httpapi.Dependencies{
		Readiness:  readinessStub{err: errors.New("connection refused")},
		Properties: &propertyListerStub{},
	})

	router.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
	assertJSONStatus(t, response, "not_ready")
}

func TestListProperties(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/properties", nil)
	response := httptest.NewRecorder()
	want := property.Property{
		ID:           "11111111-1111-4111-8111-111111111111",
		Title:        "Home in Dublin",
		AddressLine1: "14 Leeson Park",
		City:         "Dublin",
		County:       "Dublin",
		PriceCents:   89500000,
		Bedrooms:     4,
		PropertyType: "terraced",
		Longitude:    -6.2527,
		Latitude:     53.3320,
		Media: []property.Media{
			{URL: "/media/exterior.webp", Kind: "image", AltText: "Front of the home", Position: 0},
		},
	}
	router := httpapi.NewRouter(httpapi.Dependencies{
		Readiness:  readinessStub{},
		Properties: &propertyListerStub{properties: []property.Property{want}},
	})

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}

	var body struct {
		Properties []property.Property `json:"properties"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Properties) != 1 {
		t.Fatalf("property count = %d, want 1", len(body.Properties))
	}
	if !reflect.DeepEqual(body.Properties[0], want) {
		t.Fatalf("property = %#v, want %#v", body.Properties[0], want)
	}
}

func TestListPropertiesWithinBoundingBox(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/properties?bbox=-10.8,51.3,-5.3,55.5", nil)
	response := httptest.NewRecorder()
	properties := &propertyListerStub{}
	router := httpapi.NewRouter(httpapi.Dependencies{
		Readiness:  readinessStub{},
		Properties: properties,
	})

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	want := &property.Bounds{West: -10.8, South: 51.3, East: -5.3, North: 55.5}
	if !reflect.DeepEqual(properties.bounds, want) {
		t.Fatalf("bounds = %#v, want %#v", properties.bounds, want)
	}
}

func TestListPropertiesRejectsInvalidBoundingBox(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/properties?bbox=-5.3,51.3,-10.8,55.5", nil)
	response := httptest.NewRecorder()
	router := httpapi.NewRouter(httpapi.Dependencies{
		Readiness:  readinessStub{},
		Properties: &propertyListerStub{},
	})

	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Error.Code != "invalid_bbox" {
		t.Fatalf("error code = %q, want invalid_bbox", body.Error.Code)
	}
}

func TestListPropertiesWhenStoreFails(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/properties", nil)
	response := httptest.NewRecorder()
	router := httpapi.NewRouter(httpapi.Dependencies{
		Readiness:  readinessStub{},
		Properties: &propertyListerStub{err: errors.New("database details")},
	})

	router.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusInternalServerError)
	}

	var body struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Error.Code != "internal_error" {
		t.Fatalf("error code = %q, want %q", body.Error.Code, "internal_error")
	}
	if body.Error.Message != "internal server error" {
		t.Fatalf("error message = %q, want %q", body.Error.Message, "internal server error")
	}
}

func assertJSONStatus(t *testing.T, response *httptest.ResponseRecorder, want string) {
	t.Helper()

	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Status != want {
		t.Fatalf("status body = %q, want %q", body.Status, want)
	}
}

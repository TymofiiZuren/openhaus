package httpapi

import (
	"context"
	"github.com/TymofiiZuren/openhaus/services/api/internal/clientauth"
	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type clientStub struct {
	calls int
	user  managerauth.User
}

func (s *clientStub) Register(context.Context, string, string, string) error { s.calls++; return nil }
func (s *clientStub) Login(context.Context, string, string, string) (managerauth.Session, error) {
	s.calls++
	return managerauth.Session{}, clientauth.ErrRateLimited
}
func (s *clientStub) Authenticate(context.Context, string) (managerauth.User, error) {
	if s.user.ID != "" {
		return s.user, nil
	}
	return managerauth.User{}, managerauth.ErrUnauthenticated
}
func (s *clientStub) Logout(context.Context, string) error { s.calls++; return nil }

func TestClientMutationGuards(t *testing.T) {
	auth := &clientStub{}
	router := NewRouter(Dependencies{ClientAuth: auth, ClientOrigin: "http://localhost:5173"})
	for _, test := range []struct {
		origin, body string
		status       int
	}{
		{"https://other.example", `{}`, 403},
		{"", `{}`, 403},
		{"http://localhost:5173", `{"email":"a@example.com","password":""} {}`, 400},
		{"http://localhost:5173", `{"unexpected":true}`, 400},
	} {
		req := httptest.NewRequest("POST", "/api/v1/client/accounts", strings.NewReader(test.body))
		req.Header.Set("Origin", test.origin)
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		if res.Code != test.status {
			t.Fatalf("status=%d want=%d", res.Code, test.status)
		}
	}
	if auth.calls != 0 {
		t.Fatal("guarded requests reached account service")
	}
}
func TestClientSessionIsSeparateAndPrivate(t *testing.T) {
	router := NewRouter(Dependencies{ClientAuth: &clientStub{}, ClientOrigin: "http://localhost:5173"})
	for _, path := range []string{"/api/v1/client/session", "/api/v1/manager/properties"} {
		req := httptest.NewRequest("GET", path, nil)
		req.AddCookie(&http.Cookie{Name: "openhaus_client_session", Value: "invalid"})
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		if res.Code != 401 {
			t.Fatalf("unauthenticated access to %s", path)
		}
	}
	res := httptest.NewRecorder()
	router.ServeHTTP(res, httptest.NewRequest("GET", "/api/v1/client/session", nil))
	if res.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("session response is cacheable")
	}
}

type savedPropertiesStub struct {
	clientID   string
	propertyID string
	items      []property.Property
}

func (s *savedPropertiesStub) ListClientSaved(_ context.Context, clientID string) ([]property.Property, error) {
	s.clientID = clientID
	return s.items, nil
}
func (s *savedPropertiesStub) SaveClientProperty(_ context.Context, clientID, propertyID string) error {
	s.clientID, s.propertyID = clientID, propertyID
	return nil
}
func (s *savedPropertiesStub) RemoveClientSavedProperty(_ context.Context, clientID, propertyID string) error {
	s.clientID, s.propertyID = clientID, propertyID
	return nil
}

func TestClientSavedPropertiesUseAuthenticatedOwner(t *testing.T) {
	const propertyID = "11111111-1111-4111-8111-111111111111"
	auth := &clientStub{user: managerauth.User{ID: "buyer-one", Email: "buyer@example.test"}}
	saved := &savedPropertiesStub{items: []property.Property{{ID: propertyID, Title: "Saved home"}}}
	router := NewRouter(Dependencies{ClientAuth: auth, ClientSavedProperties: saved, ClientOrigin: "http://localhost:5173"})

	get := httptest.NewRequest(http.MethodGet, "/api/v1/client/saved-properties", nil)
	get.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
	getResponse := httptest.NewRecorder()
	router.ServeHTTP(getResponse, get)
	if getResponse.Code != http.StatusOK || !strings.Contains(getResponse.Body.String(), "Saved home") || saved.clientID != "buyer-one" {
		t.Fatalf("saved list status=%d owner=%q body=%s", getResponse.Code, saved.clientID, getResponse.Body.String())
	}

	put := httptest.NewRequest(http.MethodPut, "/api/v1/client/saved-properties/"+propertyID, nil)
	put.Header.Set("Origin", "http://localhost:5173")
	put.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
	putResponse := httptest.NewRecorder()
	router.ServeHTTP(putResponse, put)
	if putResponse.Code != http.StatusNoContent || saved.clientID != "buyer-one" || saved.propertyID != propertyID {
		t.Fatalf("save status=%d owner=%q property=%q", putResponse.Code, saved.clientID, saved.propertyID)
	}
}

func TestClientSavedPropertiesRejectInvalidIDAndForeignOrigin(t *testing.T) {
	auth := &clientStub{user: managerauth.User{ID: "buyer-one"}}
	saved := &savedPropertiesStub{}
	router := NewRouter(Dependencies{ClientAuth: auth, ClientSavedProperties: saved, ClientOrigin: "http://localhost:5173"})
	for _, test := range []struct {
		id, origin string
		status     int
	}{
		{"not-an-id", "http://localhost:5173", http.StatusBadRequest},
		{"11111111-1111-4111-8111-111111111111", "https://other.example", http.StatusForbidden},
	} {
		req := httptest.NewRequest(http.MethodPut, "/api/v1/client/saved-properties/"+test.id, nil)
		req.Header.Set("Origin", test.origin)
		req.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		if res.Code != test.status {
			t.Fatalf("id=%q status=%d want=%d", test.id, res.Code, test.status)
		}
	}
}

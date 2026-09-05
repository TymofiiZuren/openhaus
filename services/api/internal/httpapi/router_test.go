package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/httpapi"
	"github.com/TymofiiZuren/openhaus/services/api/internal/managerauth"
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

type managerAuthStub struct{ validToken string }

func (stub managerAuthStub) Login(_ context.Context, email, password string) (managerauth.Session, error) {
	if email != "manager@example.com" || password != "valid-password" {
		return managerauth.Session{}, managerauth.ErrInvalidCredentials
	}
	return managerauth.Session{Token: "session-token", User: managerauth.User{ID: "manager-1", Email: email}, ExpiresAt: time.Now().Add(time.Hour)}, nil
}
func (stub managerAuthStub) Authenticate(_ context.Context, token string) (managerauth.User, error) {
	if token != stub.validToken {
		return managerauth.User{}, managerauth.ErrUnauthenticated
	}
	return managerauth.User{ID: "manager-1", Email: "manager@example.com"}, nil
}
func (stub managerAuthStub) Logout(context.Context, string) error { return nil }

type managerSecurityStub struct {
	managerAuthStub
	changedUser, currentPassword, newPassword, revokedUser string
}

func (stub *managerSecurityStub) ChangePassword(_ context.Context, user managerauth.User, currentPassword, newPassword string) error {
	stub.changedUser, stub.currentPassword, stub.newPassword = user.ID, currentPassword, newPassword
	if currentPassword != "valid-password" {
		return managerauth.ErrInvalidCredentials
	}
	return nil
}
func (stub *managerSecurityStub) LogoutAll(_ context.Context, userID string) error {
	stub.revokedUser = userID
	return nil
}

type managerPropertyListerStub struct{ properties []property.ManagedProperty }

func (stub managerPropertyListerStub) ListManaged(context.Context) ([]property.ManagedProperty, error) {
	return stub.properties, nil
}

type managerPropertyWriterStub struct {
	created   property.ManagedPropertyInput
	updated   property.ManagedPropertyInput
	updatedID string
}

type spatialTourWriterStub struct{ propertyID, shareURL, altText, removedID string }

func (stub *spatialTourWriterStub) UpsertPanorama(_ context.Context, propertyID, shareURL, altText string) (property.Media, error) {
	stub.propertyID, stub.shareURL, stub.altText = propertyID, shareURL, altText
	return property.Media{URL: shareURL, Kind: "panorama", AltText: altText, Position: 4}, nil
}

func (stub *spatialTourWriterStub) RemovePanorama(_ context.Context, propertyID string) error {
	stub.removedID = propertyID
	return nil
}

func (stub *managerPropertyWriterStub) CreateManaged(_ context.Context, input property.ManagedPropertyInput) (property.ManagedProperty, error) {
	stub.created = input
	return property.ManagedProperty{Property: property.Property{ID: "new-property", Title: input.Title}, Status: "draft"}, nil
}

func (stub *managerPropertyWriterStub) UpdateManaged(_ context.Context, id string, input property.ManagedPropertyInput) (property.ManagedProperty, error) {
	stub.updatedID, stub.updated = id, input
	return property.ManagedProperty{Property: property.Property{ID: id, Title: input.Title}, Status: input.Status}, nil
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

func TestSecurityHeadersApplyToEveryAPIResponse(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()

	newRouter().ServeHTTP(response, request)

	want := map[string]string{
		"X-Content-Type-Options":       "nosniff",
		"X-Frame-Options":              "DENY",
		"Referrer-Policy":              "no-referrer",
		"Cross-Origin-Resource-Policy": "same-origin",
		"Permissions-Policy":           "camera=(), microphone=(), geolocation=()",
	}
	for header, value := range want {
		if got := response.Header().Get(header); got != value {
			t.Errorf("%s = %q, want %q", header, got, value)
		}
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

func TestManagerPropertiesRequireAuthentication(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/manager/properties", nil)
	response := httptest.NewRecorder()
	router := httpapi.NewRouter(httpapi.Dependencies{ManagerAuth: managerAuthStub{validToken: "session-token"}, ManagerProperties: managerPropertyListerStub{}})

	router.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnauthorized)
	}
}

func TestManagerCanLoginAndListDrafts(t *testing.T) {
	authenticator := managerAuthStub{validToken: "session-token"}
	router := httpapi.NewRouter(httpapi.Dependencies{ManagerAuth: authenticator, ManagerProperties: managerPropertyListerStub{properties: []property.ManagedProperty{{Property: property.Property{ID: "draft-1", Title: "Draft home"}, Status: "draft"}}}})
	login := httptest.NewRequest(http.MethodPost, "/api/v1/manager/session", strings.NewReader(`{"email":"manager@example.com","password":"valid-password"}`))
	login.Header.Set("Content-Type", "application/json")
	loginResponse := httptest.NewRecorder()
	router.ServeHTTP(loginResponse, login)
	if loginResponse.Code != http.StatusOK {
		t.Fatalf("login status = %d, want %d", loginResponse.Code, http.StatusOK)
	}
	cookies := loginResponse.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatalf("unsafe session cookie: %#v", cookies)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/v1/manager/properties", nil)
	request.AddCookie(cookies[0])
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("list status = %d, want %d", response.Code, http.StatusOK)
	}
	if !strings.Contains(response.Body.String(), `"status":"draft"`) {
		t.Fatalf("response does not include draft: %s", response.Body.String())
	}
}

func TestManagerCanReadAuthenticatedSession(t *testing.T) {
	router := httpapi.NewRouter(httpapi.Dependencies{ManagerAuth: managerAuthStub{validToken: "session-token"}})
	unauthenticated := httptest.NewRecorder()
	router.ServeHTTP(unauthenticated, httptest.NewRequest(http.MethodGet, "/api/v1/manager/session", nil))
	if unauthenticated.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated session status = %d, want %d", unauthenticated.Code, http.StatusUnauthorized)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/manager/session", nil)
	request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "session-token"})
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("session status = %d, want %d", response.Code, http.StatusOK)
	}
	if !strings.Contains(response.Body.String(), `"email":"manager@example.com"`) {
		t.Fatalf("session response does not include manager identity: %s", response.Body.String())
	}
}

func TestManagerCanChangePasswordAndRevokeAllSessions(t *testing.T) {
	authenticator := &managerSecurityStub{managerAuthStub: managerAuthStub{validToken: "session-token"}}
	router := httpapi.NewRouter(httpapi.Dependencies{ManagerAuth: authenticator})
	password := httptest.NewRequest(http.MethodPut, "/api/v1/manager/password", strings.NewReader(`{"currentPassword":"valid-password","newPassword":"a different secure password"}`))
	password.Header.Set("Content-Type", "application/json")
	password.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "session-token"})
	passwordResponse := httptest.NewRecorder()

	router.ServeHTTP(passwordResponse, password)

	if passwordResponse.Code != http.StatusNoContent || authenticator.changedUser != "manager-1" || authenticator.newPassword != "a different secure password" {
		t.Fatalf("password response = %d, changed user = %q", passwordResponse.Code, authenticator.changedUser)
	}
	if cookies := passwordResponse.Result().Cookies(); len(cookies) != 1 || cookies[0].MaxAge != -1 {
		t.Fatalf("password change did not clear session cookie: %#v", cookies)
	}

	sessions := httptest.NewRequest(http.MethodDelete, "/api/v1/manager/sessions", nil)
	sessions.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "session-token"})
	sessionsResponse := httptest.NewRecorder()
	router.ServeHTTP(sessionsResponse, sessions)
	if sessionsResponse.Code != http.StatusNoContent || authenticator.revokedUser != "manager-1" {
		t.Fatalf("session response = %d, revoked user = %q", sessionsResponse.Code, authenticator.revokedUser)
	}
}

func TestManagerSecurityRejectsUnauthenticatedAndCrossSiteRequests(t *testing.T) {
	authenticator := &managerSecurityStub{managerAuthStub: managerAuthStub{validToken: "session-token"}}
	router := httpapi.NewRouter(httpapi.Dependencies{ManagerAuth: authenticator})
	unauthenticated := httptest.NewRequest(http.MethodDelete, "/api/v1/manager/sessions", nil)
	unauthenticatedResponse := httptest.NewRecorder()
	router.ServeHTTP(unauthenticatedResponse, unauthenticated)
	if unauthenticatedResponse.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d", unauthenticatedResponse.Code)
	}

	crossSite := httptest.NewRequest(http.MethodDelete, "/api/v1/manager/sessions", nil)
	crossSite.Header.Set("Sec-Fetch-Site", "cross-site")
	crossSite.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "session-token"})
	crossSiteResponse := httptest.NewRecorder()
	router.ServeHTTP(crossSiteResponse, crossSite)
	if crossSiteResponse.Code != http.StatusForbidden {
		t.Fatalf("cross-site status = %d", crossSiteResponse.Code)
	}
}

func TestManagerPropertyMutationsRequireAuthentication(t *testing.T) {
	router := httpapi.NewRouter(httpapi.Dependencies{ManagerAuth: managerAuthStub{validToken: "session-token"}, ManagerPropertyWriter: &managerPropertyWriterStub{}})
	for _, request := range []*http.Request{
		httptest.NewRequest(http.MethodPost, "/api/v1/manager/properties", strings.NewReader(`{}`)),
		httptest.NewRequest(http.MethodPut, "/api/v1/manager/properties/property-1", strings.NewReader(`{}`)),
	} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("%s status = %d, want %d", request.Method, response.Code, http.StatusUnauthorized)
		}
	}
}

func TestManagerCanCreateDraftAndPublishIt(t *testing.T) {
	writer := &managerPropertyWriterStub{}
	router := httpapi.NewRouter(httpapi.Dependencies{ManagerAuth: managerAuthStub{validToken: "session-token"}, ManagerPropertyWriter: writer})
	body := `{"title":"Harbour home","addressLine1":"1 Pier Road","city":"Kinsale","county":"Cork","priceCents":72500000,"bedrooms":3,"propertyType":"terraced","longitude":-8.53,"latitude":51.7,"status":"published"}`
	create := httptest.NewRequest(http.MethodPost, "/api/v1/manager/properties", strings.NewReader(body))
	create.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "session-token"})
	createResponse := httptest.NewRecorder()
	router.ServeHTTP(createResponse, create)
	if createResponse.Code != http.StatusCreated || writer.created.Status != "draft" {
		t.Fatalf("create status = %d, stored status = %q", createResponse.Code, writer.created.Status)
	}

	update := httptest.NewRequest(http.MethodPut, "/api/v1/manager/properties/new-property", strings.NewReader(body))
	update.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "session-token"})
	updateResponse := httptest.NewRecorder()
	router.ServeHTTP(updateResponse, update)
	if updateResponse.Code != http.StatusOK || writer.updatedID != "new-property" || writer.updated.Status != "published" {
		t.Fatalf("update status = %d, id = %q, lifecycle = %q", updateResponse.Code, writer.updatedID, writer.updated.Status)
	}
}

func TestManagerCanAttachValidatedKuulaTour(t *testing.T) {
	writer := &spatialTourWriterStub{}
	router := httpapi.NewRouter(httpapi.Dependencies{ManagerAuth: managerAuthStub{validToken: "session-token"}, SpatialTours: writer})
	request := httptest.NewRequest(http.MethodPut, "/api/v1/manager/properties/property-1/panorama", strings.NewReader(`{"shareUrl":"https://kuula.co/share/LTPpc?fs=1","altText":"Living room 360 tour"}`))
	request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "session-token"})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK || writer.propertyID != "property-1" || writer.shareURL != "https://kuula.co/share/LTPpc?fs=1" {
		t.Fatalf("response = %d, property = %q, URL = %q", response.Code, writer.propertyID, writer.shareURL)
	}
}

func TestManagerCanRemovePanorama(t *testing.T) {
	writer := &spatialTourWriterStub{}
	router := httpapi.NewRouter(httpapi.Dependencies{ManagerAuth: managerAuthStub{validToken: "session-token"}, SpatialTours: writer})
	request := httptest.NewRequest(http.MethodDelete, "/api/v1/manager/properties/property-1/panorama", nil)
	request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "session-token"})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent || writer.removedID != "property-1" {
		t.Fatalf("response = %d, removed property = %q", response.Code, writer.removedID)
	}
}

func TestManagerPanoramaRejectsNonEmbeddableURL(t *testing.T) {
	router := httpapi.NewRouter(httpapi.Dependencies{ManagerAuth: managerAuthStub{validToken: "session-token"}, SpatialTours: &spatialTourWriterStub{}})
	request := httptest.NewRequest(http.MethodPut, "/api/v1/manager/properties/property-1/panorama", strings.NewReader(`{"shareUrl":"https://kuula.co/post/LTPpc","altText":"Tour"}`))
	request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "session-token"})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "invalid_panorama") {
		t.Fatalf("response = %d %s", response.Code, response.Body.String())
	}
}

func TestManagerPropertyRejectsInvalidInput(t *testing.T) {
	router := httpapi.NewRouter(httpapi.Dependencies{ManagerAuth: managerAuthStub{validToken: "session-token"}, ManagerPropertyWriter: &managerPropertyWriterStub{}})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/manager/properties", strings.NewReader(`{"title":"","status":"draft"}`))
	request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "session-token"})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "invalid_property") {
		t.Fatalf("response = %d %s", response.Code, response.Body.String())
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
	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
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

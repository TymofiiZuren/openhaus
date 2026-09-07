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
	calls             int
	user              managerauth.User
	currentPassword   string
	newPassword       string
	changePasswordErr error
	deletedUser       managerauth.User
	deletePassword    string
	deleteAccountErr  error
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
func (s *clientStub) ChangePassword(_ context.Context, _ managerauth.User, currentPassword, newPassword string) error {
	s.calls++
	s.currentPassword, s.newPassword = currentPassword, newPassword
	return s.changePasswordErr
}
func (s *clientStub) DeleteAccount(_ context.Context, user managerauth.User, currentPassword, _ string) error {
	s.calls++
	s.deletedUser, s.deletePassword = user, currentPassword
	return s.deleteAccountErr
}

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

type propertyNotesStub struct {
	clientID, propertyID string
	note                 property.ClientPropertyNote
}

type savedSearchesStub struct {
	clientID, searchID string
	item               property.ClientSavedSearch
	items              []property.ClientSavedSearch
	createErr          error
}

type clientDataExportStub struct {
	clientID string
	data     property.ClientDataExport
}

func (s *clientDataExportStub) ExportClientData(_ context.Context, clientID string) (property.ClientDataExport, error) {
	s.clientID = clientID
	return s.data, nil
}

func (s *savedSearchesStub) ListClientSavedSearches(_ context.Context, clientID string) ([]property.ClientSavedSearch, error) {
	s.clientID = clientID
	return s.items, nil
}
func (s *savedSearchesStub) CreateClientSavedSearch(_ context.Context, clientID string, item property.ClientSavedSearch) (property.ClientSavedSearch, error) {
	s.clientID, s.item = clientID, item
	if s.createErr != nil {
		return property.ClientSavedSearch{}, s.createErr
	}
	item.ID = "22222222-2222-4222-8222-222222222222"
	return item, nil
}
func (s *savedSearchesStub) RemoveClientSavedSearch(_ context.Context, clientID, searchID string) error {
	s.clientID, s.searchID = clientID, searchID
	return nil
}

func (s *propertyNotesStub) GetClientPropertyNote(_ context.Context, clientID, propertyID string) (property.ClientPropertyNote, error) {
	s.clientID, s.propertyID = clientID, propertyID
	return s.note, nil
}

func (s *propertyNotesStub) UpsertClientPropertyNote(_ context.Context, clientID, propertyID string, note property.ClientPropertyNote) (property.ClientPropertyNote, error) {
	s.clientID, s.propertyID, s.note = clientID, propertyID, note
	return note, nil
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

func TestClientPropertyNotesUseAuthenticatedOwner(t *testing.T) {
	const propertyID = "11111111-1111-4111-8111-111111111111"
	auth := &clientStub{user: managerauth.User{ID: "buyer-one", Email: "buyer@example.test"}}
	notes := &propertyNotesStub{note: property.ClientPropertyNote{PropertyID: propertyID, Notes: "Check the garden", Questions: []string{"Confirm fixtures"}}}
	router := NewRouter(Dependencies{ClientAuth: auth, ClientPropertyNotes: notes, ClientOrigin: "http://localhost:5173"})

	get := httptest.NewRequest(http.MethodGet, "/api/v1/client/property-notes/"+propertyID, nil)
	get.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
	getResponse := httptest.NewRecorder()
	router.ServeHTTP(getResponse, get)
	if getResponse.Code != http.StatusOK || !strings.Contains(getResponse.Body.String(), "Check the garden") || notes.clientID != "buyer-one" {
		t.Fatalf("note get status=%d owner=%q body=%s", getResponse.Code, notes.clientID, getResponse.Body.String())
	}

	put := httptest.NewRequest(http.MethodPut, "/api/v1/client/property-notes/"+propertyID, strings.NewReader(`{"notes":"Check the light","questions":["Ask about renovations"]}`))
	put.Header.Set("Origin", "http://localhost:5173")
	put.Header.Set("Content-Type", "application/json")
	put.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
	putResponse := httptest.NewRecorder()
	router.ServeHTTP(putResponse, put)
	if putResponse.Code != http.StatusOK || notes.clientID != "buyer-one" || notes.propertyID != propertyID || notes.note.Notes != "Check the light" {
		t.Fatalf("note put status=%d owner=%q property=%q note=%#v", putResponse.Code, notes.clientID, notes.propertyID, notes.note)
	}
}

func TestClientPropertyNotesRejectInvalidPayloadAndForeignOrigin(t *testing.T) {
	const propertyID = "11111111-1111-4111-8111-111111111111"
	auth := &clientStub{user: managerauth.User{ID: "buyer-one"}}
	for _, test := range []struct {
		origin, body string
		status       int
	}{
		{"https://other.example", `{"notes":"private","questions":[]}`, http.StatusForbidden},
		{"http://localhost:5173", `{"notes":"private","questions":["one","two","three","four","five","six","seven","eight","nine"]}`, http.StatusBadRequest},
		{"http://localhost:5173", `{"notes":"private","questions":[],"shared":true}`, http.StatusBadRequest},
	} {
		router := NewRouter(Dependencies{ClientAuth: auth, ClientPropertyNotes: &propertyNotesStub{}, ClientOrigin: "http://localhost:5173"})
		req := httptest.NewRequest(http.MethodPut, "/api/v1/client/property-notes/"+propertyID, strings.NewReader(test.body))
		req.Header.Set("Origin", test.origin)
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		if res.Code != test.status {
			t.Fatalf("origin=%q status=%d want=%d body=%s", test.origin, res.Code, test.status, res.Body.String())
		}
	}
}

func TestClientPasswordChangeUsesAuthenticatedAccountAndClearsCookie(t *testing.T) {
	auth := &clientStub{user: managerauth.User{ID: "buyer-one", Email: "buyer@example.test"}}
	router := NewRouter(Dependencies{ClientAuth: auth, ClientOrigin: "http://localhost:5173"})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/client/password", strings.NewReader(`{"currentPassword":"old password phrase","newPassword":"new password phrase"}`))
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusNoContent {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
	if auth.currentPassword != "old password phrase" || auth.newPassword != "new password phrase" {
		t.Fatal("password change did not reach the authenticated account service")
	}
	cookies := res.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != clientCookie || cookies[0].MaxAge != -1 {
		t.Fatalf("client session cookie was not cleared: %#v", cookies)
	}
}

func TestClientAccountDeletionReauthenticatesOwnerAndClearsCookie(t *testing.T) {
	auth := &clientStub{user: managerauth.User{ID: "buyer-one", Email: "buyer@example.test"}}
	router := NewRouter(Dependencies{ClientAuth: auth, ClientOrigin: "http://localhost:5173"})
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/client/account", strings.NewReader(`{"currentPassword":"correct horse battery staple"}`))
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusNoContent {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
	if auth.deletedUser.ID != "buyer-one" || auth.deletePassword != "correct horse battery staple" {
		t.Fatalf("deletion target=%#v password=%q", auth.deletedUser, auth.deletePassword)
	}
	cookies := res.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != clientCookie || cookies[0].MaxAge != -1 {
		t.Fatalf("client session cookie was not cleared: %#v", cookies)
	}
}

func TestClientAccountDeletionRejectsForeignOriginAndWrongPassword(t *testing.T) {
	for _, test := range []struct {
		origin string
		err    error
		status int
	}{
		{origin: "https://other.example", status: http.StatusForbidden},
		{origin: "http://localhost:5173", err: managerauth.ErrInvalidCredentials, status: http.StatusUnauthorized},
	} {
		auth := &clientStub{user: managerauth.User{ID: "buyer-one", Email: "buyer@example.test"}, deleteAccountErr: test.err}
		router := NewRouter(Dependencies{ClientAuth: auth, ClientOrigin: "http://localhost:5173"})
		req := httptest.NewRequest(http.MethodDelete, "/api/v1/client/account", strings.NewReader(`{"currentPassword":"wrong password phrase"}`))
		req.Header.Set("Origin", test.origin)
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		if res.Code != test.status {
			t.Fatalf("origin=%q status=%d want=%d body=%s", test.origin, res.Code, test.status, res.Body.String())
		}
	}
}

func TestClientSavedSearchesUseAuthenticatedOwner(t *testing.T) {
	const searchID = "22222222-2222-4222-8222-222222222222"
	auth := &clientStub{user: managerauth.User{ID: "buyer-one", Email: "buyer@example.test"}}
	searches := &savedSearchesStub{items: []property.ClientSavedSearch{{ID: searchID, Location: "Cork", Frequency: "daily", PropertyType: "all"}}}
	router := NewRouter(Dependencies{ClientAuth: auth, ClientSavedSearches: searches, ClientOrigin: "http://localhost:5173"})

	get := httptest.NewRequest(http.MethodGet, "/api/v1/client/saved-searches", nil)
	get.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
	getResponse := httptest.NewRecorder()
	router.ServeHTTP(getResponse, get)
	if getResponse.Code != http.StatusOK || !strings.Contains(getResponse.Body.String(), "Cork") || searches.clientID != "buyer-one" {
		t.Fatalf("saved searches status=%d owner=%q body=%s", getResponse.Code, searches.clientID, getResponse.Body.String())
	}

	body := `{"location":"Cork","county":"Cork","area":"","query":"garden","minimumBedrooms":3,"propertyType":"detached","maximumPrice":80000000,"spatialOnly":true,"frequency":"daily"}`
	post := httptest.NewRequest(http.MethodPost, "/api/v1/client/saved-searches", strings.NewReader(body))
	post.Header.Set("Origin", "http://localhost:5173")
	post.Header.Set("Content-Type", "application/json")
	post.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
	postResponse := httptest.NewRecorder()
	router.ServeHTTP(postResponse, post)
	if postResponse.Code != http.StatusCreated || searches.clientID != "buyer-one" || searches.item.Query != "garden" {
		t.Fatalf("create status=%d owner=%q item=%#v body=%s", postResponse.Code, searches.clientID, searches.item, postResponse.Body.String())
	}

	remove := httptest.NewRequest(http.MethodDelete, "/api/v1/client/saved-searches/"+searchID, nil)
	remove.Header.Set("Origin", "http://localhost:5173")
	remove.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
	removeResponse := httptest.NewRecorder()
	router.ServeHTTP(removeResponse, remove)
	if removeResponse.Code != http.StatusNoContent || searches.clientID != "buyer-one" || searches.searchID != searchID {
		t.Fatalf("remove status=%d owner=%q search=%q", removeResponse.Code, searches.clientID, searches.searchID)
	}
}

func TestClientSavedSearchesRejectUntrustedFieldsAndForeignOrigin(t *testing.T) {
	auth := &clientStub{user: managerauth.User{ID: "buyer-one"}}
	searches := &savedSearchesStub{}
	router := NewRouter(Dependencies{ClientAuth: auth, ClientSavedSearches: searches, ClientOrigin: "http://localhost:5173"})
	for _, test := range []struct {
		origin, body string
		status       int
	}{
		{"https://other.example", `{"location":"Cork","propertyType":"all","frequency":"daily"}`, http.StatusForbidden},
		{"http://localhost:5173", `{"id":"22222222-2222-4222-8222-222222222222","location":"Cork","propertyType":"all","frequency":"daily"}`, http.StatusBadRequest},
		{"http://localhost:5173", `{"location":"Cork","propertyType":"all","frequency":"hourly"}`, http.StatusBadRequest},
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/client/saved-searches", strings.NewReader(test.body))
		req.Header.Set("Origin", test.origin)
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		if res.Code != test.status {
			t.Fatalf("origin=%q status=%d want=%d body=%s", test.origin, res.Code, test.status, res.Body.String())
		}
	}
}

func TestClientSavedSearchesReportThePerAccountLimit(t *testing.T) {
	auth := &clientStub{user: managerauth.User{ID: "buyer-one"}}
	searches := &savedSearchesStub{createErr: property.ErrSavedSearchLimit}
	router := NewRouter(Dependencies{ClientAuth: auth, ClientSavedSearches: searches, ClientOrigin: "http://localhost:5173"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/client/saved-searches", strings.NewReader(`{"location":"Cork","minimumBedrooms":0,"propertyType":"all","maximumPrice":0,"spatialOnly":false,"frequency":"daily"}`))
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusConflict || !strings.Contains(res.Body.String(), "saved_search_limit") {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
}

func TestClientDataExportUsesAuthenticatedOwnerAndDownloadsJSON(t *testing.T) {
	auth := &clientStub{user: managerauth.User{ID: "buyer-one", Email: "buyer@example.test"}}
	exporter := &clientDataExportStub{data: property.ClientDataExport{
		SavedPropertyIDs: []string{"11111111-1111-4111-8111-111111111111"},
		SavedSearches:    []property.ClientSavedSearch{{ID: "22222222-2222-4222-8222-222222222222", Location: "Cork", PropertyType: "all", Frequency: "daily"}},
		PropertyNotes:    []property.ClientPropertyNote{{PropertyID: "11111111-1111-4111-8111-111111111111", Notes: "Check the garden", Questions: []string{}}},
	}}
	router := NewRouter(Dependencies{ClientAuth: auth, ClientDataExport: exporter, ClientOrigin: "http://localhost:5173"})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/client/export", nil)
	req.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	if res.Code != http.StatusOK || exporter.clientID != "buyer-one" || !strings.Contains(res.Body.String(), "buyer@example.test") || !strings.Contains(res.Body.String(), "Check the garden") {
		t.Fatalf("status=%d owner=%q body=%s", res.Code, exporter.clientID, res.Body.String())
	}
	if res.Header().Get("Cache-Control") != "no-store" || !strings.Contains(res.Header().Get("Content-Disposition"), "attachment") {
		t.Fatalf("unsafe export headers: cache=%q disposition=%q", res.Header().Get("Cache-Control"), res.Header().Get("Content-Disposition"))
	}
}

func TestClientPasswordChangeRejectsForeignOriginAndMissingSession(t *testing.T) {
	for _, test := range []struct {
		origin string
		cookie bool
		status int
	}{
		{origin: "https://other.example", cookie: true, status: http.StatusForbidden},
		{origin: "http://localhost:5173", cookie: false, status: http.StatusUnauthorized},
	} {
		auth := &clientStub{user: managerauth.User{ID: "buyer-one", Email: "buyer@example.test"}}
		router := NewRouter(Dependencies{ClientAuth: auth, ClientOrigin: "http://localhost:5173"})
		req := httptest.NewRequest(http.MethodPut, "/api/v1/client/password", strings.NewReader(`{"currentPassword":"old password phrase","newPassword":"new password phrase"}`))
		req.Header.Set("Origin", test.origin)
		req.Header.Set("Content-Type", "application/json")
		if test.cookie {
			req.AddCookie(&http.Cookie{Name: clientCookie, Value: "valid"})
		} else {
			auth.user = managerauth.User{}
		}
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		if res.Code != test.status {
			t.Fatalf("origin=%q cookie=%t status=%d want=%d", test.origin, test.cookie, res.Code, test.status)
		}
	}
}

package httpapi_test

import (
	"bytes"
	"context"
	"errors"
	"github.com/TymofiiZuren/openhaus/services/api/internal/httpapi"
	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

type imagesStub struct {
	saved  property.Media
	addErr error
}

func (s *imagesStub) AddImage(_ context.Context, _ string, kind, url, description string) (property.Media, error) {
	if s.addErr != nil {
		return property.Media{}, s.addErr
	}
	s.saved = property.Media{URL: url, Kind: kind, AltText: description}
	return s.saved, nil
}
func (s *imagesStub) OrderImages(context.Context, string, []string) ([]property.Media, error) {
	return nil, nil
}
func (s *imagesStub) ImagePublished(context.Context, string) (bool, error) { return false, nil }
func (s *imagesStub) UpdateImageDescription(_ context.Context, _ string, url, description string) (property.Media, error) {
	return property.Media{URL: url, Kind: "image", AltText: description}, nil
}
func TestImageDescriptionRequiresAuthenticationAndValidText(t *testing.T) {
	router := httpapi.NewRouter(httpapi.Dependencies{Images: &imagesStub{}, ManagerAuth: managerAuthStub{validToken: "valid"}})
	for _, test := range []struct {
		authenticated bool
		body          string
		status        int
	}{
		{false, `{"url":"/photo.png","description":"Garden"}`, 401},
		{true, `{"url":"/photo.png","description":"   "}`, 400},
		{true, `{"url":"/photo.png","description":"Garden"}`, 200},
	} {
		request := httptest.NewRequest("PATCH", "/api/v1/manager/properties/home/image-description", strings.NewReader(test.body))
		if test.authenticated {
			request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "valid"})
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != test.status {
			t.Fatalf("status %d, want %d", response.Code, test.status)
		}
	}
}
func TestImageUploadAndDraftPrivacy(t *testing.T) {
	store := &imagesStub{}
	router := httpapi.NewRouter(httpapi.Dependencies{Images: store, ImageRoot: t.TempDir(), ManagerAuth: managerAuthStub{validToken: "valid"}})
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writer.WriteField("kind", "floor_plan")
	writer.WriteField("description", "Ground floor")
	part, _ := writer.CreateFormFile("image", "plan.png")
	png.Encode(part, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	writer.Close()
	request := httptest.NewRequest("POST", "/api/v1/manager/properties/home/images", bytes.NewReader(body.Bytes()))
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != 401 {
		t.Fatalf("unauthorized upload: %d", response.Code)
	}
	request = httptest.NewRequest("POST", "/api/v1/manager/properties/home/images", bytes.NewReader(body.Bytes()))
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "valid"})
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != 201 {
		t.Fatalf("upload: %d %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", store.saved.URL, nil))
	if response.Code != 404 {
		t.Fatal("draft exposed")
	}
	request = httptest.NewRequest("GET", "/api/v1/manager/property-images/"+store.saved.URL[len("/api/v1/property-images/"):], nil)
	request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "valid"})
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != 200 {
		t.Fatalf("manager preview: %d", response.Code)
	}
}

func TestImageUploadRemovesFileWhenAttachmentFails(t *testing.T) {
	root := t.TempDir()
	store := &imagesStub{addErr: errors.New("database unavailable")}
	router := httpapi.NewRouter(httpapi.Dependencies{Images: store, ImageRoot: root, ManagerAuth: managerAuthStub{validToken: "valid"}})
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writer.WriteField("kind", "image")
	writer.WriteField("description", "Front elevation")
	part, _ := writer.CreateFormFile("image", "front.png")
	png.Encode(part, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	writer.Close()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/manager/properties/home/images", bytes.NewReader(body.Bytes()))
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "valid"})
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status=%d want=%d", response.Code, http.StatusBadRequest)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatalf("read upload root: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("failed attachment left %d file(s) behind", len(entries))
	}
}

package httpapi_test

import (
	"bytes"
	"context"
	"errors"
	"github.com/TymofiiZuren/openhaus/services/api/internal/httpapi"
	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
	"image"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type imagesStub struct {
	saved     property.Media
	addErr    error
	published bool
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
func (s *imagesStub) ImagePublished(context.Context, string) (bool, error) { return s.published, nil }
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
	for _, format := range []string{"png", "jpeg"} {
		t.Run(format, func(t *testing.T) { checkImageUploadAndPrivacy(t, format) })
	}
}
func checkImageUploadAndPrivacy(t *testing.T, format string) {
	store := &imagesStub{}
	router := httpapi.NewRouter(httpapi.Dependencies{Images: store, ImageRoot: t.TempDir(), ManagerAuth: managerAuthStub{validToken: "valid"}})
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writer.WriteField("kind", "floor_plan")
	writer.WriteField("description", "Ground floor")
	part, _ := writer.CreateFormFile("image", "plan.png")
	img := image.NewRGBA(image.Rect(0, 0, 960, 640))
	if format == "jpeg" {
		jpeg.Encode(part, img, nil)
	} else {
		png.Encode(part, img)
	}
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
	extension := ".png"
	if format == "jpeg" {
		extension = ".jpg"
	}
	if !strings.HasSuffix(store.saved.URL, extension) {
		t.Fatalf("wrong detected extension: %s", store.saved.URL)
	}
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", store.saved.URL, nil))
	if response.Code != 404 {
		t.Fatal("draft exposed")
	}
	request = httptest.NewRequest("GET", "/api/v1/manager/property-images/"+store.saved.URL[len("/api/v1/property-images/"):], nil)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != 401 {
		t.Fatalf("unauthenticated manager preview: %d", response.Code)
	}
	request = httptest.NewRequest("GET", "/api/v1/manager/property-images/"+store.saved.URL[len("/api/v1/property-images/"):], nil)
	request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "valid"})
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != 200 {
		t.Fatalf("manager preview: %d", response.Code)
	}
	if response.Header().Get("Content-Type") != "image/"+format || response.Header().Get("Cache-Control") != "private, no-store" || response.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("incorrect image response headers: %v", response.Header())
	}
	if _, decodedFormat, err := image.Decode(bytes.NewReader(response.Body.Bytes())); err != nil || decodedFormat != format {
		t.Fatalf("invalid served image: %s %v", decodedFormat, err)
	}
	store.published = true
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", store.saved.URL, nil))
	if response.Code != 200 {
		t.Fatalf("published image unavailable: %d", response.Code)
	}
	for _, published := range []bool{false, true} {
		store.published = published
		response = httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest("GET", store.saved.URL+"?size=thumbnail", nil))
		want := 404
		if published {
			want = 200
		}
		if response.Code != want {
			t.Fatalf("public thumbnail published=%v: %d", published, response.Code)
		}
	}
	previewURL := strings.Replace(store.saved.URL, "/property-images/", "/manager/property-images/", 1) + "?size=thumbnail"
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", previewURL, nil))
	if response.Code != 401 {
		t.Fatal("thumbnail preview bypassed authentication")
	}
	request = httptest.NewRequest("GET", previewURL, nil)
	request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "valid"})
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	config, _, err := image.DecodeConfig(bytes.NewReader(response.Body.Bytes()))
	if response.Code != 200 || err != nil || config.Width != 480 || config.Height != 320 {
		t.Fatalf("thumbnail response: %d %v %v", response.Code, config, err)
	}
	if response.Header().Get("Cache-Control") != "private, no-store" || response.Header().Get("Content-Type") != "image/"+format {
		t.Fatal("incorrect thumbnail headers")
	}
	direct := strings.TrimSuffix(store.saved.URL, extension) + ".thumb" + extension
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", direct, nil))
	if response.Code != 404 {
		t.Fatal("internal derivative filename exposed")
	}
}

func TestImageUploadRemovesFileWhenAttachmentFails(t *testing.T) {
	for _, format := range []string{"png", "jpeg"} {
		t.Run(format, func(t *testing.T) { checkFailedImageAttachment(t, format) })
	}
}
func checkFailedImageAttachment(t *testing.T, format string) {
	root := t.TempDir()
	store := &imagesStub{addErr: errors.New("database unavailable")}
	router := httpapi.NewRouter(httpapi.Dependencies{Images: store, ImageRoot: root, ManagerAuth: managerAuthStub{validToken: "valid"}})
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writer.WriteField("kind", "image")
	writer.WriteField("description", "Front elevation")
	part, _ := writer.CreateFormFile("image", "front.png")
	img := image.NewRGBA(image.Rect(0, 0, 960, 640))
	if format == "jpeg" {
		jpeg.Encode(part, img, nil)
	} else {
		png.Encode(part, img)
	}
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

func TestThumbnailLegacyFallbackAndInvalidSizes(t *testing.T) {
	root := t.TempDir()
	var data bytes.Buffer
	if err := png.Encode(&data, image.NewRGBA(image.Rect(0, 0, 32, 16))); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "legacy.png"), data.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	router := httpapi.NewRouter(httpapi.Dependencies{Images: &imagesStub{published: true}, ImageRoot: root})
	for _, tc := range []struct {
		query  string
		status int
	}{{"?size=thumbnail", 200}, {"?size=large", 400}, {"?size=../../secret", 400}} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest("GET", "/api/v1/property-images/legacy.png"+tc.query, nil))
		if response.Code != tc.status {
			t.Fatalf("%s: got %d want %d", tc.query, response.Code, tc.status)
		}
		if tc.status == 200 && !bytes.Equal(response.Body.Bytes(), data.Bytes()) {
			t.Fatal("legacy fallback changed original")
		}
	}
	if err := os.Mkdir(filepath.Join(root, "legacy.thumb.png"), 0700); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/api/v1/property-images/legacy.png?size=thumbnail", nil))
	if response.Code != 500 {
		t.Fatalf("invalid derivative silently fell back: %d", response.Code)
	}
}

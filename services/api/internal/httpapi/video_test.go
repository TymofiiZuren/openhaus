package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/TymofiiZuren/openhaus/services/api/internal/httpapi"
	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
)

type uploadStub struct {
	propertyID string
	filename   string
	job        mediajob.Job
	err        error
}

func (stub *uploadStub) AcceptUpload(_ context.Context, propertyID, filename string, _ io.Reader) (mediajob.Job, error) {
	stub.propertyID = propertyID
	stub.filename = filename
	return stub.job, stub.err
}

type jobGetterStub struct {
	job mediajob.Job
	err error
}

func authenticatedMediaRouter(uploader httpapi.VideoUploader, jobs jobGetterStub) http.Handler {
	return httpapi.NewRouter(httpapi.Dependencies{Readiness: readinessStub{}, Properties: &propertyListerStub{}, Videos: uploader, Jobs: jobs, ManagerAuth: managerAuthStub{validToken: "session-token"}})
}

type uploadFunc func(context.Context, string, string, io.Reader) (mediajob.Job, error)

func (fn uploadFunc) AcceptUpload(ctx context.Context, id, name string, source io.Reader) (mediajob.Job, error) {
	return fn(ctx, id, name, source)
}

type observedUploadBody struct {
	io.Reader
	rejected            bool
	readsAfterRejection int
	reads               int
	cancel              context.CancelFunc
}

func (body *observedUploadBody) Read(p []byte) (int, error) {
	if body.rejected {
		body.readsAfterRejection++
	}
	body.reads++
	n, err := body.Reader.Read(p)
	if body.cancel != nil && body.reads == 2 {
		body.cancel()
		body.rejected = true
	}
	return n, err
}

type uploadCreator struct {
	called bool
	job    mediajob.Job
}

func (creator *uploadCreator) Create(_ context.Context, job mediajob.Job) error {
	creator.called = true
	creator.job = job
	return nil
}

func TestMultipartVideoUploadUsesRealStorageWithoutExposingSource(t *testing.T) {
	for _, signedIn := range []bool{false, true} {
		name := "anonymous rejected"
		if signedIn {
			name = "authenticated accepted"
		}
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			creator := &uploadCreator{}
			router := authenticatedMediaRouter(mediajob.NewUploadService(root, creator), jobGetterStub{})
			payload := append([]byte("\x00\x00\x00\x18ftypqt  "), bytes.Repeat([]byte("synthetic-video"), 80)...)
			body := &bytes.Buffer{}
			writer := multipart.NewWriter(body)
			part, err := writer.CreateFormFile("video", "tour.mov")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := part.Write(payload); err != nil {
				t.Fatal(err)
			}
			if err := writer.Close(); err != nil {
				t.Fatal(err)
			}
			request := managerRequest(http.MethodPost, "/api/v1/manager/properties/property-1/videos", body)
			if !signedIn {
				request.Header.Del("Cookie")
			}
			request.Header.Set("Content-Type", writer.FormDataContentType())
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("private upload response is cacheable")
			}
			files, err := os.ReadDir(root)
			if err != nil {
				t.Fatal(err)
			}
			if !signedIn {
				if response.Code != http.StatusUnauthorized || creator.called || len(files) != 0 {
					t.Fatal("anonymous upload reached storage or queue")
				}
				return
			}
			if response.Code != http.StatusAccepted || !creator.called {
				t.Fatalf("upload status=%d, queued=%t", response.Code, creator.called)
			}
			if len(files) != 1 || filepath.Base(creator.job.SourcePath) != creator.job.ID+".mov" {
				t.Fatal("upload not atomically stored under job identity")
			}
			stored, err := os.ReadFile(creator.job.SourcePath)
			if err != nil || !bytes.Equal(stored, payload) {
				t.Fatal("stored upload differs from multipart payload")
			}
			var returned mediajob.Job
			if err := json.Unmarshal(response.Body.Bytes(), &returned); err != nil {
				t.Fatal(err)
			}
			if returned.ID != creator.job.ID || returned.PropertyID != "property-1" || returned.Status != mediajob.StatusPending {
				t.Fatal("response does not describe queued job")
			}
			if strings.Contains(response.Body.String(), "sourcePath") || strings.Contains(response.Body.String(), root) || returned.SourcePath != "" {
				t.Fatal("private source path exposed")
			}
		})
	}
}

func TestEmptyVideoUploadIsUnsupportedRatherThanServerFailure(t *testing.T) {
	buffer := &bytes.Buffer{}
	writer := multipart.NewWriter(buffer)
	if _, err := writer.CreateFormFile("video", "empty.mp4"); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	creator := &uploadCreator{}
	request := managerRequest(http.MethodPost, "/api/v1/manager/properties/property-1/videos", buffer)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	authenticatedMediaRouter(mediajob.NewUploadService(root, creator), jobGetterStub{}).ServeHTTP(response, request)
	if response.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status = %d; want 415", response.Code)
	}
	var result struct{ Error struct{ Code string } }
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Error.Code != "unsupported_media" {
		t.Fatalf("code = %q", result.Error.Code)
	}
	if creator.called {
		t.Fatal("empty video created a job")
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatal("empty upload retained files")
	}
}

func TestCancelledVideoRequestCleansUpWithoutQueueing(t *testing.T) {
	buffer := &bytes.Buffer{}
	writer := multipart.NewWriter(buffer)
	part, err := writer.CreateFormFile("video", "tour.mov")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(append([]byte("\x00\x00\x00\x18ftypqt  "), bytes.Repeat([]byte("video"), 16<<10)...))
	_ = writer.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	body := &observedUploadBody{Reader: buffer, cancel: cancel}
	root := t.TempDir()
	creator := &uploadCreator{}
	uploader := mediajob.NewUploadService(root, creator)
	request := managerRequest(http.MethodPost, "/api/v1/manager/properties/property-1/videos", body).WithContext(ctx)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()
	authenticatedMediaRouter(uploader, jobGetterStub{}).ServeHTTP(response, request)
	if response.Code != http.StatusRequestTimeout {
		t.Fatalf("status = %d", response.Code)
	}
	var result struct{ Error struct{ Code string } }
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Error.Code != "upload_interrupted" {
		t.Fatalf("code = %q", result.Error.Code)
	}
	if creator.called {
		t.Fatal("interrupted upload queued a job")
	}
	if body.readsAfterRejection != 0 {
		t.Fatalf("read %d times after cancellation", body.readsAfterRejection)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("retained %d upload files", len(entries))
	}
}

func TestRejectedVideoUploadDoesNotDrainRemainingBody(t *testing.T) {
	for _, tc := range []struct {
		name   string
		err    error
		status int
	}{
		{"cancelled", context.Canceled, http.StatusRequestTimeout},
		{"deadline", context.DeadlineExceeded, http.StatusRequestTimeout},
		{"unsupported", mediajob.ErrUnsupportedMedia, http.StatusUnsupportedMediaType},
		{"oversized", &http.MaxBytesError{Limit: 1}, http.StatusRequestEntityTooLarge},
		{"failed", errors.New("upload unavailable"), http.StatusInternalServerError},
	} {
		t.Run(tc.name, func(t *testing.T) {
			buffer := &bytes.Buffer{}
			writer := multipart.NewWriter(buffer)
			part, err := writer.CreateFormFile("video", "tour.mp4")
			if err != nil {
				t.Fatal(err)
			}
			_, _ = part.Write(bytes.Repeat([]byte("x"), 64<<10))
			_ = writer.Close()
			body := &observedUploadBody{Reader: buffer}
			uploader := uploadFunc(func(context.Context, string, string, io.Reader) (mediajob.Job, error) {
				body.rejected = true
				return mediajob.Job{}, tc.err
			})
			request := managerRequest(http.MethodPost, "/api/v1/manager/properties/property-1/videos", body)
			request.Header.Set("Content-Type", writer.FormDataContentType())
			response := httptest.NewRecorder()
			authenticatedMediaRouter(uploader, jobGetterStub{}).ServeHTTP(response, request)
			if body.readsAfterRejection != 0 {
				t.Errorf("read body %d times after rejection", body.readsAfterRejection)
			}
			if response.Code != tc.status {
				t.Errorf("status = %d, want %d", response.Code, tc.status)
			}
		})
	}
}

func managerRequest(method, target string, body io.Reader) *http.Request {
	request := httptest.NewRequest(method, target, body)
	request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "session-token"})
	return request
}

func TestMediaRoutesRequireManagerAuthentication(t *testing.T) {
	router := authenticatedMediaRouter(&uploadStub{}, jobGetterStub{})
	for _, request := range []*http.Request{
		httptest.NewRequest(http.MethodPost, "/api/v1/manager/properties/property-1/videos", nil),
		httptest.NewRequest(http.MethodGet, "/api/v1/manager/media-jobs/job-1", nil),
	} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("%s status = %d, want %d", request.Method, response.Code, http.StatusUnauthorized)
		}
	}
}

func (stub jobGetterStub) Get(context.Context, string) (mediajob.Job, error) {
	return stub.job, stub.err
}

func TestUploadVideoReturnsAcceptedJob(t *testing.T) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("video", "tour.mov")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write([]byte("video bytes"))
	_ = writer.Close()
	uploader := &uploadStub{job: mediajob.Job{ID: "job-1", PropertyID: "property-1", Status: mediajob.StatusPending}}
	router := authenticatedMediaRouter(uploader, jobGetterStub{})
	request := managerRequest(http.MethodPost, "/api/v1/manager/properties/property-1/videos", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want %d; body=%s", response.Code, http.StatusAccepted, response.Body.String())
	}
	if uploader.propertyID != "property-1" || uploader.filename != "tour.mov" {
		t.Fatalf("upload = %q %q, want property-1 tour.mov", uploader.propertyID, uploader.filename)
	}
}

func TestUploadVideoRequiresVideoPart(t *testing.T) {
	router := authenticatedMediaRouter(&uploadStub{}, jobGetterStub{})
	request := managerRequest(http.MethodPost, "/api/v1/manager/properties/property-1/videos", bytes.NewBufferString("missing"))
	request.Header.Set("Content-Type", "text/plain")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

func TestUploadVideoRejectsOversizedBody(t *testing.T) {
	uploader := &uploadStub{err: &http.MaxBytesError{Limit: 1}}
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("video", "tour.mp4")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write([]byte("too large"))
	_ = writer.Close()
	router := authenticatedMediaRouter(uploader, jobGetterStub{})
	request := managerRequest(http.MethodPost, "/api/v1/manager/properties/property-1/videos", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestGetMediaJob(t *testing.T) {
	want := mediajob.Job{ID: "job-1", PropertyID: "property-1", Status: mediajob.StatusProcessing, Attempts: 1}
	router := authenticatedMediaRouter(&uploadStub{}, jobGetterStub{job: want})
	request := managerRequest(http.MethodGet, "/api/v1/manager/media-jobs/job-1", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	var got mediajob.Job
	if err := json.NewDecoder(response.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got.ID != want.ID || got.Status != want.Status {
		t.Fatalf("job = %#v, want %#v", got, want)
	}
}

func TestGetMissingMediaJobReturnsNotFound(t *testing.T) {
	router := authenticatedMediaRouter(&uploadStub{}, jobGetterStub{err: mediajob.ErrNotFound})
	request := managerRequest(http.MethodGet, "/api/v1/manager/media-jobs/missing", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

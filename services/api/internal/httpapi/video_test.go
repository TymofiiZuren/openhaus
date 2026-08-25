package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
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
	router := httpapi.NewRouter(httpapi.Dependencies{Readiness: readinessStub{}, Properties: propertyListerStub{}, Videos: uploader, Jobs: jobGetterStub{}})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/properties/property-1/videos", body)
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
	router := httpapi.NewRouter(httpapi.Dependencies{Readiness: readinessStub{}, Properties: propertyListerStub{}, Videos: &uploadStub{}, Jobs: jobGetterStub{}})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/properties/property-1/videos", bytes.NewBufferString("missing"))
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
	router := httpapi.NewRouter(httpapi.Dependencies{Readiness: readinessStub{}, Properties: propertyListerStub{}, Videos: uploader, Jobs: jobGetterStub{}})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/properties/property-1/videos", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestGetMediaJob(t *testing.T) {
	want := mediajob.Job{ID: "job-1", PropertyID: "property-1", Status: mediajob.StatusProcessing, Attempts: 1}
	router := httpapi.NewRouter(httpapi.Dependencies{Readiness: readinessStub{}, Properties: propertyListerStub{}, Videos: &uploadStub{}, Jobs: jobGetterStub{job: want}})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/media-jobs/job-1", nil)
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
	router := httpapi.NewRouter(httpapi.Dependencies{Readiness: readinessStub{}, Properties: propertyListerStub{}, Videos: &uploadStub{}, Jobs: jobGetterStub{err: mediajob.ErrNotFound}})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/media-jobs/missing", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

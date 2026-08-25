package mediajob

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	StatusPending    = "pending"
	StatusProcessing = "processing"
	StatusReady      = "ready"
	StatusFailed     = "failed"
)

var (
	ErrNotFound         = errors.New("media job not found")
	ErrUnsupportedMedia = errors.New("unsupported media type")
)

type Job struct {
	ID           string     `json:"id"`
	PropertyID   string     `json:"propertyId"`
	SourcePath   string     `json:"-"`
	OutputPath   string     `json:"outputPath,omitempty"`
	Status       string     `json:"status"`
	Attempts     int16      `json:"attempts"`
	ErrorMessage string     `json:"errorMessage,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	StartedAt    *time.Time `json:"startedAt,omitempty"`
	CompletedAt  *time.Time `json:"completedAt,omitempty"`
}

type Creator interface {
	Create(context.Context, Job) error
}

type UploadService struct {
	root    string
	creator Creator
}

func NewUploadService(root string, creator Creator) *UploadService {
	return &UploadService{root: root, creator: creator}
}

func (service *UploadService) AcceptUpload(ctx context.Context, propertyID, filename string, source io.Reader) (Job, error) {
	if err := os.MkdirAll(service.root, 0o750); err != nil {
		return Job{}, fmt.Errorf("create upload directory: %w", err)
	}

	header := make([]byte, 512)
	read, err := io.ReadFull(source, header)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		return Job{}, fmt.Errorf("read media header: %w", err)
	}
	header = header[:read]
	if !isMP4Family(header) {
		return Job{}, ErrUnsupportedMedia
	}

	id, err := newUUID()
	if err != nil {
		return Job{}, fmt.Errorf("generate job ID: %w", err)
	}
	extension := strings.ToLower(filepath.Ext(filename))
	if extension != ".mov" {
		extension = ".mp4"
	}
	temporary, err := os.CreateTemp(service.root, ".upload-*")
	if err != nil {
		return Job{}, fmt.Errorf("create temporary upload: %w", err)
	}
	temporaryPath := temporary.Name()
	keep := false
	defer func() {
		_ = temporary.Close()
		if !keep {
			_ = os.Remove(temporaryPath)
		}
	}()

	if _, err := io.Copy(temporary, io.MultiReader(strings.NewReader(string(header)), source)); err != nil {
		return Job{}, fmt.Errorf("store upload: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return Job{}, fmt.Errorf("sync upload: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return Job{}, fmt.Errorf("close upload: %w", err)
	}

	finalPath := filepath.Join(service.root, id+extension)
	if err := os.Rename(temporaryPath, finalPath); err != nil {
		return Job{}, fmt.Errorf("publish upload: %w", err)
	}
	temporaryPath = finalPath

	job := Job{ID: id, PropertyID: propertyID, SourcePath: finalPath, Status: StatusPending, CreatedAt: time.Now().UTC()}
	if err := service.creator.Create(ctx, job); err != nil {
		return Job{}, fmt.Errorf("create media job: %w", err)
	}
	keep = true
	return job, nil
}

func isMP4Family(header []byte) bool {
	return len(header) >= 12 && string(header[4:8]) == "ftyp" &&
		(http.DetectContentType(header) == "video/mp4" ||
			http.DetectContentType(header) == "video/quicktime" ||
			http.DetectContentType(header) == "application/octet-stream")
}

func newUUID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", value[0:4], value[4:6], value[6:8], value[8:10], value[10:16]), nil
}

package httpapi

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"github.com/TymofiiZuren/openhaus/services/api/internal/property"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type ImageStore interface {
	UpdateImageDescription(context.Context, string, string, string) (property.Media, error)
	AddImage(context.Context, string, string, string, string) (property.Media, error)
	OrderImages(context.Context, string, []string) ([]property.Media, error)
	ImagePublished(context.Context, string) (bool, error)
}

func updateImageDescription(store ImageStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 8<<10)
		var body struct {
			URL         string `json:"url"`
			Description string `json:"description"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			writeError(w, 400, "invalid_description", "A photo URL and description are required")
			return
		}
		body.Description = strings.TrimSpace(body.Description)
		if body.URL == "" || len(body.URL) > 2048 || body.Description == "" || len(body.Description) > 500 {
			writeError(w, 400, "invalid_description", "Provide a description up to 500 bytes")
			return
		}
		media, err := store.UpdateImageDescription(r.Context(), r.PathValue("propertyID"), body.URL, body.Description)
		if errors.Is(err, property.ErrNotFound) {
			writeError(w, 404, "image_not_found", "Image not found on this listing")
			return
		}
		if err != nil {
			writeError(w, 500, "save_failed", "Could not save description")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(media)
	}
}

type sanitizedImage struct {
	data      []byte
	thumbnail []byte
	extension string
}

func sanitizeImage(data []byte) (sanitizedImage, error) {
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "jpeg" && format != "png") || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 24000000 {
		return sanitizedImage{}, errors.New("invalid image")
	}
	decoded, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return sanitizedImage{}, err
	}
	var clean bytes.Buffer
	extension := ".png"
	if format == "jpeg" {
		extension = ".jpg"
		decoded = orientImage(decoded, jpegOrientation(data))
		err = jpeg.Encode(&clean, decoded, &jpeg.Options{Quality: 90})
	} else {
		err = png.Encode(&clean, decoded)
	}
	if err != nil {
		return sanitizedImage{}, err
	}
	result := sanitizedImage{data: clean.Bytes(), extension: extension}
	preview := thumbnailImage(decoded)
	if preview != decoded {
		var thumbnail bytes.Buffer
		if format == "jpeg" {
			err = jpeg.Encode(&thumbnail, preview, &jpeg.Options{Quality: 85})
		} else {
			err = png.Encode(&thumbnail, preview)
		}
		if err != nil {
			return sanitizedImage{}, err
		}
		result.thumbnail = thumbnail.Bytes()
	}
	return result, nil
}

func uploadImage(store ImageStore, root string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, 503, "unavailable", "Image uploads unavailable")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 12<<20)
		if err := r.ParseMultipartForm(12 << 20); err != nil {
			writeError(w, 400, "invalid_upload", "Choose a JPEG or PNG smaller than 10 MiB")
			return
		}
		defer r.MultipartForm.RemoveAll()
		kind := r.FormValue("kind")
		description := strings.TrimSpace(r.FormValue("description"))
		if (kind != "image" && kind != "floor_plan") || description == "" || len(description) > 500 {
			writeError(w, 400, "invalid_details", "Choose a media type and description (up to 500 characters)")
			return
		}
		file, header, err := r.FormFile("image")
		if err != nil {
			writeError(w, 400, "image_required", "Choose an image")
			return
		}
		defer file.Close()
		if header.Size > 10<<20 {
			writeError(w, 413, "too_large", "Image exceeds 10 MiB")
			return
		}
		data, err := io.ReadAll(io.LimitReader(file, (10<<20)+1))
		if err != nil || len(data) > 10<<20 {
			writeError(w, 413, "too_large", "Image exceeds 10 MiB")
			return
		}
		clean, err := sanitizeImage(data)
		if err != nil {
			writeError(w, 415, "invalid_image", "Use a valid JPEG or PNG, up to 24 megapixels")
			return
		}
		name := rand.Text() + clean.extension
		url := "/api/v1/property-images/" + name
		path := filepath.Join(root, name)
		thumbnailPath := filepath.Join(root, strings.TrimSuffix(name, clean.extension)+".thumb"+clean.extension)
		attached := false
		defer func() {
			if !attached {
				_ = os.Remove(path)
				if len(clean.thumbnail) > 0 {
					_ = os.Remove(thumbnailPath)
				}
			}
		}()
		if err = os.MkdirAll(root, 0700); err == nil {
			err = os.WriteFile(path, clean.data, 0600)
		}
		if err == nil && len(clean.thumbnail) > 0 {
			err = os.WriteFile(thumbnailPath, clean.thumbnail, 0600)
		}
		if err != nil {
			writeError(w, 500, "storage_failed", "Could not save image")
			return
		}
		media, err := store.AddImage(r.Context(), r.PathValue("propertyID"), kind, url, description)
		if err != nil {
			writeError(w, 400, "save_failed", "Could not attach image to this property")
			return
		}
		attached = true
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(media)
	}
}

func orderImages(store ImageStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
		var body struct {
			URLs []string `json:"urls"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || len(body.URLs) == 0 || len(body.URLs) > 200 {
			writeError(w, 400, "invalid_order", "Provide the complete photo order")
			return
		}
		media, err := store.OrderImages(r.Context(), r.PathValue("propertyID"), body.URLs)
		if err != nil {
			writeError(w, 409, "order_conflict", "Photos changed. Refresh the page and try again")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(media)
	}
}

var imageName = regexp.MustCompile(`^[A-Za-z0-9]+\.(png|jpg)$`)

func serveImage(store ImageStore, root string, manager bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		if !imageName.MatchString(name) {
			http.NotFound(w, r)
			return
		}
		if !manager {
			published, err := store.ImagePublished(r.Context(), "/api/v1/property-images/"+name)
			if err != nil || !published {
				http.NotFound(w, r)
				return
			}
		}
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		path := filepath.Join(root, name)
		switch r.URL.Query().Get("size") {
		case "":
		case "thumbnail":
			extension := filepath.Ext(name)
			preview := filepath.Join(root, strings.TrimSuffix(name, extension)+".thumb"+extension)
			if info, err := os.Stat(preview); err == nil && info.Mode().IsRegular() {
				path = preview
			} else if err == nil || !os.IsNotExist(err) {
				writeError(w, 500, "storage_failed", "Could not read image preview")
				return
			}
		default:
			writeError(w, 400, "invalid_size", "Use size=thumbnail or omit size for the full image")
			return
		}
		http.ServeFile(w, r, path)
	}
}

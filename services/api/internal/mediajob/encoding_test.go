package mediajob_test

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
)

func TestProcessorEncodingStreamPolicy(t *testing.T) {
	if os.Getenv("MEDIA_TEST_FFMPEG") != "1" {
		t.Skip("set MEDIA_TEST_FFMPEG=1 for real encoding policy tests")
	}
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Fatal(err)
	}
	ffprobe, err := exec.LookPath("ffprobe")
	if err != nil {
		t.Fatal(err)
	}
	for _, audioOnly := range []bool{true, false} {
		t.Run(fmt.Sprintf("audioOnly=%t", audioOnly), func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
			defer cancel()
			root := t.TempDir()
			source := filepath.Join(root, "source.mp4")
			args := []string{"-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2"}
			if !audioOnly {
				metadata := filepath.Join(root, "chapters.txt")
				if err := os.WriteFile(metadata, []byte(";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=200\ntitle=source-marker\n"), 0o600); err != nil {
					t.Fatal(err)
				}
				args = append(args, "-f", "lavfi", "-i", "color=c=blue:size=64x48:rate=30:duration=0.2",
					"-f", "lavfi", "-i", "color=c=red:size=128x96:rate=30:duration=0.2",
					"-f", "ffmetadata", "-i", metadata,
					"-map", "1:v", "-map", "2:v", "-map", "0:a", "-map_chapters", "3",
					"-c:v", "libx264", "-metadata:s:v:0", "handler_name=source-marker")
			}
			args = append(args, "-c:a", "aac", "-metadata", "title=source-marker", "-metadata", "comment=source-marker", "-metadata:s:a:0", "handler_name=source-marker", source)
			if output, err := exec.CommandContext(ctx, ffmpeg, args...).CombinedOutput(); err != nil {
				t.Fatalf("fixture: %v (diagnostic bytes: %d)", err, len(output))
			}
			queue := &queueStub{job: mediajob.Job{ID: "policy", SourcePath: source}}
			err := mediajob.NewProcessor(queue, ffmpeg, root, "/media").ProcessNext(ctx)
			published := filepath.Join(root, "policy-0.mp4")
			if audioOnly {
				if err == nil || queue.failedJobID != "policy" || queue.completedJobID != "" {
					t.Fatal("audio-only source was not rejected")
				}
				if _, err := os.Stat(published); !os.IsNotExist(err) {
					t.Fatal("rejected source published output")
				}
				if _, err := os.Stat(source); err != nil {
					t.Fatal("failed source was not retained")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			output, err := exec.CommandContext(ctx, ffprobe, "-v", "error", "-show_streams", "-show_format", "-show_chapters", "-of", "json", published).Output()
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(string(output), "source-marker") {
				t.Fatal("source metadata copied to published video")
			}
			var probe struct {
				Streams []struct {
					Type  string `json:"codec_type"`
					Width int    `json:"width"`
				}
				Chapters []json.RawMessage
			}
			if err := json.Unmarshal(output, &probe); err != nil {
				t.Fatal(err)
			}
			if len(probe.Streams) != 2 || probe.Streams[0].Type != "video" || probe.Streams[1].Type != "audio" || len(probe.Chapters) != 0 {
				t.Fatal("unexpected output stream policy")
			}
			if probe.Streams[0].Width != 64 {
				t.Fatal("did not select the first video track")
			}
		})
	}
}

// Synthetic fixtures keep this opt-in contract test independent of private uploads.
func TestProcessorEncodingBounds(t *testing.T) {
	if os.Getenv("MEDIA_TEST_FFMPEG") != "1" {
		t.Skip("set MEDIA_TEST_FFMPEG=1 for real encoding boundary tests")
	}
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Fatal(err)
	}
	ffprobe, err := exec.LookPath("ffprobe")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name                                                 string
		width, height, sarNum, sarDen, wantWidth, wantHeight int
	}{
		{"small", 320, 240, 1, 1, 320, 240},
		{"portrait", 1080, 1920, 1, 1, 608, 1080},
		{"4k", 3840, 2160, 1, 1, 1920, 1080},
		{"odd", 641, 481, 1, 1, 640, 480},
		{"anamorphic", 720, 576, 16, 15, 720, 576},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
			defer cancel()
			root := t.TempDir()
			source := filepath.Join(root, "source.mov")
			// RGB testsrc + PNG preserves odd dimensions and sample aspect ratio.
			fixture := fmt.Sprintf("testsrc=size=%dx%d:rate=30,setsar=%d/%d", tc.width, tc.height, tc.sarNum, tc.sarDen)
			if output, err := exec.CommandContext(ctx, ffmpeg, "-v", "error", "-f", "lavfi", "-i", fixture, "-frames:v", "3", "-c:v", "png", source).CombinedOutput(); err != nil {
				t.Fatalf("fixture: %v (diagnostic bytes: %d)", err, len(output))
			}
			queue := &queueStub{job: mediajob.Job{ID: "bounded", SourcePath: source}}
			if err := mediajob.NewProcessor(queue, ffmpeg, root, "/media").ProcessNext(ctx); err != nil {
				t.Fatal(err)
			}
			if queue.completedURL != "/media/bounded-0.mp4" {
				t.Fatalf("completion = %q", queue.completedURL)
			}
			published := filepath.Join(root, "bounded-0.mp4")
			output, err := exec.CommandContext(ctx, ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,sample_aspect_ratio,codec_name,pix_fmt,r_frame_rate", "-of", "json", published).Output()
			if err != nil {
				t.Fatal(err)
			}
			var probe struct {
				Streams []struct {
					Width, Height int
					SAR           string `json:"sample_aspect_ratio"`
					Codec         string `json:"codec_name"`
					PixelFormat   string `json:"pix_fmt"`
					FrameRate     string `json:"r_frame_rate"`
				}
			}
			if err := json.Unmarshal(output, &probe); err != nil {
				t.Fatal(err)
			}
			if len(probe.Streams) != 1 {
				t.Fatalf("video streams = %d", len(probe.Streams))
			}
			stream := probe.Streams[0]
			if stream.Width != tc.wantWidth || stream.Height != tc.wantHeight {
				t.Fatalf("dimensions = %dx%d, want %dx%d", stream.Width, stream.Height, tc.wantWidth, tc.wantHeight)
			}
			var num, den float64
			if _, err := fmt.Sscanf(stream.SAR, "%f:%f", &num, &den); err != nil || den == 0 {
				t.Fatalf("invalid SAR %q", stream.SAR)
			}
			wantAspect := float64(tc.width) * float64(tc.sarNum) / float64(tc.height) / float64(tc.sarDen)
			gotAspect := float64(stream.Width) * num / float64(stream.Height) / den
			if math.Abs(gotAspect-wantAspect) > 0.001 {
				t.Fatalf("display aspect = %f, want %f", gotAspect, wantAspect)
			}
			if stream.Codec != "h264" || stream.PixelFormat != "yuv420p" || stream.FrameRate != "30/1" {
				t.Fatalf("unexpected encoding: %+v", stream)
			}
			if output, err := exec.CommandContext(ctx, ffmpeg, "-v", "error", "-xerror", "-i", published, "-f", "null", "-").CombinedOutput(); err != nil || len(output) != 0 {
				t.Fatalf("decode: %v (diagnostic bytes: %d)", err, len(output))
			}
		})
	}
}

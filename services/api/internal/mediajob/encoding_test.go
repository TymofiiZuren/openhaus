package mediajob_test

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
)

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
			if queue.completedURL != "/media/bounded.mp4" {
				t.Fatalf("completion = %q", queue.completedURL)
			}
			published := filepath.Join(root, "bounded.mp4")
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

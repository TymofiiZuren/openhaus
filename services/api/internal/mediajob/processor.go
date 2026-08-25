package mediajob

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type Queue interface {
	ClaimNext(context.Context) (Job, error)
	Complete(context.Context, string, string, string) error
	Fail(context.Context, string, string) error
}

type Processor struct {
	queue                                Queue
	ffmpegPath, outputRoot, publicPrefix string
}

func NewProcessor(queue Queue, ffmpegPath, outputRoot, publicPrefix string) *Processor {
	return &Processor{queue: queue, ffmpegPath: ffmpegPath, outputRoot: outputRoot, publicPrefix: strings.TrimRight(publicPrefix, "/")}
}

func (processor *Processor) Run(ctx context.Context) error {
	if err := os.MkdirAll(processor.outputRoot, 0o750); err != nil {
		return err
	}
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		err := processor.ProcessNext(ctx)
		if err != nil && !errors.Is(err, ErrNotFound) {
			log.Printf("process media job: %v", err)
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

func (processor *Processor) ProcessNext(ctx context.Context) error {
	if err := os.MkdirAll(processor.outputRoot, 0o750); err != nil {
		return fmt.Errorf("create media output directory: %w", err)
	}
	job, err := processor.queue.ClaimNext(ctx)
	if err != nil {
		return err
	}
	outputPath := filepath.Join(processor.outputRoot, job.ID+".mp4")
	command := exec.CommandContext(ctx, processor.ffmpegPath,
		"-y", "-i", job.SourcePath, "-vf", "fps=30,scale=1920:-2:flags=lanczos",
		"-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p",
		"-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", outputPath)
	if output, runErr := command.CombinedOutput(); runErr != nil {
		_ = os.Remove(outputPath)
		message := fmt.Sprintf("ffmpeg failed: %v: %.1000s", runErr, output)
		if failErr := processor.queue.Fail(ctx, job.ID, "video processing failed"); failErr != nil {
			return fmt.Errorf("%s; record failure: %w", message, failErr)
		}
		return errors.New(message)
	}
	mediaID, err := newUUID()
	if err != nil {
		return err
	}
	outputURL := processor.publicPrefix + "/" + filepath.Base(outputPath)
	if err := processor.queue.Complete(ctx, job.ID, outputURL, mediaID); err != nil {
		return err
	}
	_ = os.Remove(job.SourcePath)
	return nil
}

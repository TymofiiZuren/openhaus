package mediajob

import (
	"context"
	"errors"
	"fmt"
	"io"
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
	// Stage on the same filesystem so rename publishes a complete file atomically.
	staging, err := os.CreateTemp(processor.outputRoot, ".processing-*.mp4")
	if err != nil {
		return processor.recordFailure(ctx, job.ID, err)
	}
	stagingPath := staging.Name()
	defer os.Remove(stagingPath)
	if err := staging.Close(); err != nil {
		return processor.recordFailure(ctx, job.ID, err)
	}
	encodeCtx, cancel := context.WithTimeout(ctx, 20*time.Minute)
	defer cancel()
	command := exec.CommandContext(encodeCtx, processor.ffmpegPath,
		"-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", job.SourcePath, "-vf", "fps=30,scale=1920:-2:flags=lanczos",
		"-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p",
		"-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", stagingPath)
	// Encoder diagnostics may include private paths or malicious metadata. Do not
	// accumulate or log them; retain the process exit status and context error.
	command.Stdout, command.Stderr = io.Discard, io.Discard
	command.WaitDelay = 2 * time.Second
	if runErr := command.Run(); runErr != nil {
		if encodeCtx.Err() != nil {
			runErr = encodeCtx.Err()
		}
		return processor.recordFailure(ctx, job.ID, fmt.Errorf("ffmpeg failed: %w", runErr))
	}
	if err := encodeCtx.Err(); err != nil {
		return processor.recordFailure(ctx, job.ID, err)
	}
	info, err := os.Stat(stagingPath)
	if err != nil {
		return processor.recordFailure(ctx, job.ID, err)
	}
	if !info.Mode().IsRegular() || info.Size() == 0 {
		return processor.recordFailure(ctx, job.ID, errors.New("encoder produced no video"))
	}
	mediaID, err := newUUID()
	if err != nil {
		return processor.recordFailure(ctx, job.ID, err)
	}
	if err := os.Rename(stagingPath, outputPath); err != nil {
		return processor.recordFailure(ctx, job.ID, err)
	}
	outputURL := processor.publicPrefix + "/" + filepath.Base(outputPath)
	// Finish the short database transition even if shutdown interrupted the caller.
	completionCtx, finish := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer finish()
	if err := processor.queue.Complete(completionCtx, job.ID, outputURL, mediaID); err != nil {
		return err
	}
	_ = os.Remove(job.SourcePath)
	return nil
}

func (processor *Processor) recordFailure(ctx context.Context, jobID string, cause error) error {
	recordCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := processor.queue.Fail(recordCtx, jobID, "video processing failed"); err != nil {
		return errors.Join(cause, fmt.Errorf("record failure: %w", err))
	}
	return cause
}

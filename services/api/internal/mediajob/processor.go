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
	if ctx.Err() != nil {
		return nil
	}
	if err := os.MkdirAll(processor.outputRoot, 0o750); err != nil {
		return err
	}
	delay := time.Second
	for {
		if ctx.Err() != nil {
			return nil
		}
		err := processor.ProcessNext(ctx)
		if ctx.Err() != nil {
			return nil
		}
		failed := err != nil && !errors.Is(err, ErrNotFound)
		if failed {
			log.Printf("process media job: %v", err)
		} else {
			delay = time.Second
		}
		// Wait after the attempt ends; a ticker can leave an immediate tick queued
		// behind a long encode. This only delays polling, never replays a job.
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}
		if failed {
			delay = min(delay*2, 30*time.Second)
		}
	}
}

func (processor *Processor) ProcessNext(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.MkdirAll(processor.outputRoot, 0o750); err != nil {
		return fmt.Errorf("create media output directory: %w", err)
	}
	// Bound queue acquisition separately from the much longer encoding deadline.
	// An uncertain claim must not trigger a failure transition or source cleanup.
	claimCtx, cancelClaim := context.WithTimeout(ctx, 5*time.Second)
	job, err := processor.queue.ClaimNext(claimCtx)
	cancelClaim()
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
	// Bound both encoded dimensions without enlarging small sources. Even sizes
	// support yuv420p; scale preserves display aspect ratio through sample aspect ratio.
	command := exec.CommandContext(encodeCtx, processor.ffmpegPath,
		"-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", job.SourcePath,
		// Require real video, excluding attached cover art; audio is optional.
		// Drop source tags/chapters rather than leaking them into public tours.
		"-map", "0:V:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_metadata:s", "-1", "-map_chapters", "-1",
		"-vf", "fps=30,scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos",
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

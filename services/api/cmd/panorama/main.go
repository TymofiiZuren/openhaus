// panorama prepares a local cubemap bundle; it never changes listing records.
package main

import (
	"context"
	"flag"
	"fmt"
	"github.com/TymofiiZuren/openhaus/services/api/internal/panorama"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"time"
)

func run() error {
	input := flag.String("input", "", "local JPEG or PNG panorama")
	output := flag.String("output", "", "new output directory (must not exist)")
	native := flag.String("native", "", "path to compiled C++ converter")
	size := flag.Int("size", 1024, "cube face width, 1..2048")
	verify := flag.String("verify", "", "verify an existing bundle directory without modifying it")
	flag.Parse()
	if *verify != "" {
		conversionFlag := false
		flag.Visit(func(value *flag.Flag) {
			if value.Name != "verify" {
				conversionFlag = true
			}
		})
		if conversionFlag || flag.NArg() != 0 {
			return fmt.Errorf("-verify cannot be combined with conversion arguments")
		}
		if err := panorama.VerifyBundle(*verify); err != nil {
			return err
		}
		fmt.Println("Panorama bundle verified: all six JPEG faces and checksums match")
		return nil
	}
	if *input == "" || *output == "" || *native == "" || flag.NArg() != 0 {
		return fmt.Errorf("require -input, -output and -native; see -help")
	}
	if *size < 1 || *size > 2048 {
		return fmt.Errorf("face size must be 1..2048")
	}
	executable, err := exec.LookPath(*native)
	if err != nil {
		return fmt.Errorf("native converter is not executable: %w", err)
	}
	file, err := os.Open(*input)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("input must be a regular file")
	}
	data, err := io.ReadAll(io.LimitReader(file, (32<<20)+1))
	if err != nil {
		return err
	}
	if len(data) > 32<<20 {
		return fmt.Errorf("input exceeds 32 MiB")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	if err := panorama.WriteBundle(ctx, executable, data, *output, *size); err != nil {
		return err
	}
	fmt.Println("Panorama bundle ready:", *output+"/bundle/manifest.json")
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "panorama:", err)
		os.Exit(1)
	}
}

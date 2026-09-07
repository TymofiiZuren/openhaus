package main

import (
	"context"
	"testing"
	"time"
)

func TestConnectDatabaseRejectsUnreachableDatabase(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	pool, err := connectDatabase(ctx, "postgres://openhaus:openhaus@127.0.0.1:1/openhaus?sslmode=disable")
	if pool != nil {
		pool.Close()
	}
	if err == nil {
		t.Fatal("connectDatabase() error = nil, want unreachable database error")
	}
}

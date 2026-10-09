package main

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestValidateStartupConfiguration(t *testing.T) {
	for _, test := range []struct {
		name, environment, accounts, origin, wantError string
	}{
		{name: "legacy local defaults"},
		{name: "production demo", environment: "production", accounts: "false"},
		{name: "local accounts", environment: "development", accounts: "true", origin: "http://127.0.0.1:5177"},
		{name: "environment typo", environment: "prodution", wantError: "APP_ENV"},
		{name: "unsupported staging", environment: "staging", wantError: "APP_ENV"},
		{name: "boolean typo", environment: "production", accounts: "TRUE", wantError: "ENABLE_CLIENT_ACCOUNTS"},
		{name: "production accounts blocked", environment: "production", accounts: "true", wantError: "development-only"},
		{name: "implicit development accounts blocked", accounts: "true", wantError: "development-only"},
		{name: "missing origin", environment: "development", accounts: "true", wantError: "CLIENT_ORIGIN"},
		{name: "origin path", environment: "development", accounts: "true", origin: "http://localhost/path", wantError: "CLIENT_ORIGIN"},
		{name: "empty origin query", environment: "development", accounts: "true", origin: "http://localhost?", wantError: "CLIENT_ORIGIN"},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := validateStartupConfiguration(test.environment, test.accounts, test.origin)
			if test.wantError == "" {
				if err != nil {
					t.Fatalf("unexpected configuration rejection: %v", err)
				}
			} else if err == nil || !strings.Contains(err.Error(), test.wantError) {
				t.Fatalf("error = %v, want %q", err, test.wantError)
			}
		})
	}
}

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

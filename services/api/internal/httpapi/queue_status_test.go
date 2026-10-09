package httpapi_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/TymofiiZuren/openhaus/services/api/internal/httpapi"
	"github.com/TymofiiZuren/openhaus/services/api/internal/mediajob"
)

type queueStatusStub struct {
	calls   int
	fail    bool
	bounded bool
}

func (s *queueStatusStub) QueueStatus(ctx context.Context) (mediajob.QueueStatus, error) {
	s.calls++
	deadline, ok := ctx.Deadline()
	s.bounded = ok && time.Until(deadline) <= 2*time.Second
	if s.fail {
		return mediajob.QueueStatus{}, errors.New("private database detail")
	}
	return mediajob.QueueStatus{ObservedAt: time.Now(), Pending: 2, Processing: 1}, nil
}

func TestManagerQueueStatusBoundary(t *testing.T) {
	for _, authenticated := range []bool{false, true} {
		for _, fail := range []bool{false, true} {
			store := &queueStatusStub{fail: fail}
			router := httpapi.NewRouter(httpapi.Dependencies{ManagerAuth: managerAuthStub{validToken: "test-session"}, QueueStatus: store})
			request := httptest.NewRequest("GET", "/api/v1/manager/media-queue", nil)
			if authenticated {
				request.AddCookie(&http.Cookie{Name: "openhaus_manager_session", Value: "test-session"})
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			want := 401
			if authenticated {
				want = 200
				if fail {
					want = 503
				}
			}
			if response.Code != want {
				t.Fatalf("status = %d, want %d", response.Code, want)
			}
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("queue snapshot may be cached")
			}
			if !authenticated && store.calls != 0 {
				t.Fatal("unauthenticated queue access reached store")
			}
			if authenticated && !store.bounded {
				t.Fatal("queue lookup lacks a deadline")
			}
			if strings.Contains(response.Body.String(), "private database detail") {
				t.Fatal("internal error leaked")
			}
			if authenticated && !fail && !strings.Contains(response.Body.String(), `"pending":2`) {
				t.Fatal("missing queue counts")
			}
		}
	}
}

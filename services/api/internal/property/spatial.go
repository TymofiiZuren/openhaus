package property

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
)

var ErrInvalidSpatialTour = errors.New("invalid spatial tour URL")
var kuulaSharePath = regexp.MustCompile(`^/share/(?:[A-Za-z0-9]+/)?(?:collection/)?[A-Za-z0-9]+/?$`)

// NormalizeKuulaShareURL accepts only embeddable HTTPS Kuula share links.
func NormalizeKuulaShareURL(value string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || !kuulaSharePath.MatchString(parsed.Path) {
		return "", ErrInvalidSpatialTour
	}
	host := strings.ToLower(parsed.Hostname())
	if host != "kuula.co" && host != "www.kuula.co" && host != "mls.kuu.la" {
		return "", ErrInvalidSpatialTour
	}
	parsed.Fragment = ""
	return parsed.String(), nil
}
